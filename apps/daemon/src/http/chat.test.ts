import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../index';
import type { Provider, ChatRequest, AgentEvent } from '../providers/types';
import { ProviderRegistry } from '../providers/registry';
import { RoleResolver } from '../roles/resolver';
import { FileSessionStore } from '../sessions/store';

const FIXED_REPLY = 'hello world';

type CallLog = { messages: ChatRequest['messages']; model?: string };

function fakeProvider(log: CallLog[] = []): Provider {
  return {
    id: 'anthropic-claude-cli',
    displayName: 'Claude (fake)',
    authMode: 'cli-passthrough',
    status: async () => ({ loggedIn: true }),
    chat: function (req: ChatRequest): AsyncIterable<AgentEvent> {
      log.push({ messages: req.messages, model: req.model });
      return (async function* () {
        yield { type: 'text-delta', text: 'hello ' };
        yield { type: 'text-delta', text: 'world' };
        yield { type: 'done' };
      })();
    },
  };
}

let dir: string;
let store: FileSessionStore;
let registry: ProviderRegistry;
let calls: CallLog[];
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-chat-'));
  store = new FileSessionStore(dir);
  registry = new ProviderRegistry();
  calls = [];
  registry.register(fakeProvider(calls));
  app = buildApp({
    registry,
    sessions: store,
    roles: new RoleResolver({}, {}),
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /chat', () => {
  it('returns 400 when message is missing', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({ providerId: 'anthropic-claude-cli' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when neither sessionId nor providerId is given', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: { role: 'user', content: 'hi' } }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when providerId is unknown (new session path)', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        providerId: 'unknown',
        message: { role: 'user', content: 'hi' },
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when sessionId is unknown', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'does-not-exist',
        message: { role: 'user', content: 'hi' },
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('creates a new session when sessionId is omitted', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        providerId: 'anthropic-claude-cli',
        message: { role: 'user', content: 'hi' },
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/event-stream');
    const sid = res.headers.get('x-atlas-session-id');
    expect(sid).toBeTruthy();
    await res.text();
    const persisted = await store.get(sid!);
    expect(persisted?.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: FIXED_REPLY },
    ]);
  });

  it('streams SSE text-delta and done events', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        providerId: 'anthropic-claude-cli',
        message: { role: 'user', content: 'hi' },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const body = await res.text();
    expect(body).toContain('event: text-delta');
    expect(body).toContain('"text":"hello "');
    expect(body).toContain('"text":"world"');
    expect(body).toContain('event: done');
  });

  it('replays prior messages plus new user message to the provider on reuse', async () => {
    const session = await store.create({ providerId: 'anthropic-claude-cli' });
    await store.appendMessage(session.id, { role: 'user', content: 'turn 1' });
    await store.appendMessage(session.id, {
      role: 'assistant',
      content: 'reply 1',
    });

    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.id,
        message: { role: 'user', content: 'turn 2' },
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-atlas-session-id')).toBe(session.id);
    await res.text();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.messages).toEqual([
      { role: 'user', content: 'turn 1' },
      { role: 'assistant', content: 'reply 1' },
      { role: 'user', content: 'turn 2' },
    ]);

    const updated = await store.get(session.id);
    expect(updated?.messages).toEqual([
      { role: 'user', content: 'turn 1' },
      { role: 'assistant', content: 'reply 1' },
      { role: 'user', content: 'turn 2' },
      { role: 'assistant', content: FIXED_REPLY },
    ]);
  });

  it('rejects message with non-user role', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        providerId: 'anthropic-claude-cli',
        message: { role: 'assistant', content: 'sneaky' },
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('generates a title via the title role after the first exchange', async () => {
    const titleRegistry = new ProviderRegistry();
    titleRegistry.register(fakeProvider());
    titleRegistry.register({
      id: 'openai',
      displayName: 'openai (fake title)',
      authMode: 'apiKey',
      status: async () => ({ loggedIn: true }),
      chat: function (): AsyncIterable<AgentEvent> {
        return (async function* () {
          yield { type: 'text-delta', text: 'Generated Title' };
          yield { type: 'done' };
        })();
      },
    });
    const titleResolver = new RoleResolver(
      { providerId: 'anthropic-claude-cli' },
      { title: { providerId: 'openai' } },
    );
    const titleApp = buildApp({
      registry: titleRegistry,
      sessions: store,
      roles: titleResolver,
    });

    const res = await titleApp.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        providerId: 'anthropic-claude-cli',
        message: { role: 'user', content: 'hi' },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const sid = res.headers.get('x-atlas-session-id');
    await res.text();
    expect(sid).toBeTruthy();

    // Title generation is fire-and-forget — poll briefly until it lands.
    const deadline = Date.now() + 500;
    let title = '';
    while (Date.now() < deadline) {
      const s = await store.get(sid!);
      if (s && s.title === 'Generated Title') {
        title = s.title;
        break;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(title).toBe('Generated Title');
  });

  it('skips title generation when title role is unconfigured', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        providerId: 'anthropic-claude-cli',
        message: { role: 'user', content: 'leave the title alone' },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const sid = res.headers.get('x-atlas-session-id');
    await res.text();
    await new Promise((r) => setTimeout(r, 50));
    const s = await store.get(sid!);
    expect(s?.title).toBe('leave the title alone');
  });
});
