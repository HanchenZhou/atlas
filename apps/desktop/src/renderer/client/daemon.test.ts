import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
  spyOn,
} from 'bun:test';
import { DaemonClient, parseSseFrames, type Session } from './daemon';

let fetchSpy: Mock<typeof fetch>;

beforeEach(() => {
  fetchSpy = spyOn(globalThis, 'fetch') as unknown as Mock<typeof fetch>;
});

afterEach(() => {
  fetchSpy.mockRestore();
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function sseResponse(frames: string[], sessionId: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'x-atlas-session-id': sessionId,
    },
  });
}

describe('parseSseFrames', () => {
  it('parses a single complete event', () => {
    const out = parseSseFrames('event: text-delta\ndata: {"text":"hi"}\n\n');
    expect(out.events).toEqual([
      { type: 'text-delta', text: 'hi' },
    ]);
    expect(out.remaining).toBe('');
  });

  it('parses multiple events in one buffer', () => {
    const buf =
      'event: text-delta\ndata: {"text":"a"}\n\n' +
      'event: text-delta\ndata: {"text":"b"}\n\n' +
      'event: done\ndata: {}\n\n';
    const out = parseSseFrames(buf);
    expect(out.events).toEqual([
      { type: 'text-delta', text: 'a' },
      { type: 'text-delta', text: 'b' },
      { type: 'done' },
    ]);
    expect(out.remaining).toBe('');
  });

  it('keeps incomplete trailing frame in remaining', () => {
    const out = parseSseFrames(
      'event: text-delta\ndata: {"text":"a"}\n\nevent: text-delta\ndata: {"tex',
    );
    expect(out.events).toEqual([{ type: 'text-delta', text: 'a' }]);
    expect(out.remaining).toBe('event: text-delta\ndata: {"tex');
  });

  it('handles \\r\\n line endings', () => {
    const out = parseSseFrames(
      'event: text-delta\r\ndata: {"text":"x"}\r\n\r\n',
    );
    expect(out.events).toEqual([{ type: 'text-delta', text: 'x' }]);
  });

  it('drops malformed frames without crashing', () => {
    const out = parseSseFrames(
      'event: text-delta\ndata: not-json\n\nevent: done\ndata: {}\n\n',
    );
    expect(out.events).toEqual([{ type: 'done' }]);
    expect(out.remaining).toBe('');
  });
});

describe('DaemonClient.chat', () => {
  it('returns sessionId from X-Atlas-Session-Id header and streams events', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse(
        [
          'event: text-delta\ndata: {"text":"hi"}\n\n',
          'event: done\ndata: {}\n\n',
        ],
        'sess-abc',
      ),
    );

    const client = new DaemonClient('http://example');
    const { sessionId, events } = await client.chat({
      providerId: 'openai',
      message: { role: 'user', content: 'hello' },
    });
    expect(sessionId).toBe('sess-abc');

    const collected = [];
    for await (const ev of events) collected.push(ev);
    expect(collected).toEqual([
      { type: 'text-delta', text: 'hi' },
      { type: 'done' },
    ]);
  });

  it('passes sessionId in body when reusing a session', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse(['event: done\ndata: {}\n\n'], 'sess-1'),
    );

    const client = new DaemonClient('http://example');
    await client.chat({
      sessionId: 'sess-1',
      message: { role: 'user', content: 'turn 2' },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      sessionId: 'sess-1',
      message: { role: 'user', content: 'turn 2' },
    });
  });

  it('throws when daemon returns an error status', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: 'session not found' }, { status: 404 }),
    );

    const client = new DaemonClient('http://example');
    await expect(
      client.chat({
        sessionId: 'nope',
        message: { role: 'user', content: 'hi' },
      }),
    ).rejects.toThrow(/session not found/);
  });

  it('throws when X-Atlas-Session-Id header is missing', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.close();
      },
    });
    fetchSpy.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const client = new DaemonClient('http://example');
    await expect(
      client.chat({ providerId: 'openai', message: { role: 'user', content: 'hi' } }),
    ).rejects.toThrow(/X-Atlas-Session-Id/);
  });
});

describe('DaemonClient.listSessions', () => {
  it('returns the session summaries', async () => {
    const summary = {
      id: 's1',
      title: 'first',
      providerId: 'openai',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    fetchSpy.mockResolvedValue(jsonResponse([summary]));
    const client = new DaemonClient('http://example');
    expect(await client.listSessions()).toEqual([summary]);
    expect(fetchSpy).toHaveBeenCalledWith('http://example/sessions');
  });

  it('throws on non-200', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 500 }));
    const client = new DaemonClient('http://example');
    await expect(client.listSessions()).rejects.toThrow();
  });
});

describe('DaemonClient.getSession', () => {
  it('returns the session', async () => {
    const session: Session = {
      id: 's1',
      title: 't',
      providerId: 'openai',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      messages: [{ role: 'user', content: 'hi' }],
    };
    fetchSpy.mockResolvedValue(jsonResponse(session));
    const client = new DaemonClient('http://example');
    expect(await client.getSession('s1')).toEqual(session);
    expect(fetchSpy).toHaveBeenCalledWith('http://example/sessions/s1');
  });

  it('returns undefined on 404', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 404 }));
    const client = new DaemonClient('http://example');
    expect(await client.getSession('nope')).toBeUndefined();
  });
});

describe('DaemonClient.deleteSession', () => {
  it('sends DELETE', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const client = new DaemonClient('http://example');
    await client.deleteSession('s1');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://example/sessions/s1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
