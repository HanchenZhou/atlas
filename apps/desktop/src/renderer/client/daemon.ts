export type AgentEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; args: unknown }
  | {
      type: 'tool-result';
      id: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }
  | {
      type: 'done';
      sessionId?: string;
      usage?: { inputTokens: number; outputTokens: number };
      costUsd?: number;
      billing?: 'subscription' | 'api';
    }
  | { type: 'error'; message: string };

export type ProviderInfo = {
  id: string;
  displayName: string;
  authMode: 'cli-passthrough' | 'apiKey' | 'oauth';
  status: { loggedIn: boolean; detail?: string };
};

export type SessionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type SessionSummary = {
  id: string;
  title: string;
  providerId: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
};

export type Session = SessionSummary & { messages: SessionMessage[] };

export type ChatRequest = {
  sessionId?: string;
  providerId?: string;
  model?: string;
  message: { role: 'user'; content: string };
  signal?: AbortSignal;
};

export type ChatResponse = {
  sessionId: string;
  events: AsyncIterable<AgentEvent>;
};

const DEFAULT_BASE_URL = 'http://localhost:3001';

export class DaemonClient {
  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

  async listProviders(): Promise<ProviderInfo[]> {
    const res = await fetch(`${this.baseUrl}/providers`);
    if (!res.ok) throw new Error(`GET /providers failed: ${res.status}`);
    return (await res.json()) as ProviderInfo[];
  }

  async login(providerId: string, payload: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}/providers/${providerId}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `login failed: ${res.status}`);
    }
  }

  async logout(providerId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/providers/${providerId}/credential`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 204) {
      throw new Error(`logout failed: ${res.status}`);
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    const res = await fetch(`${this.baseUrl}/sessions`);
    if (!res.ok) throw new Error(`GET /sessions failed: ${res.status}`);
    return (await res.json()) as SessionSummary[];
  }

  async getSession(id: string): Promise<Session | undefined> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`GET /sessions/${id} failed: ${res.status}`);
    return (await res.json()) as Session;
  }

  async deleteSession(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`DELETE /sessions/${id} failed: ${res.status}`);
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = { message: req.message };
    if (req.sessionId) body.sessionId = req.sessionId;
    if (req.providerId) body.providerId = req.providerId;
    if (req.model) body.model = req.model;

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(req.signal && { signal: req.signal }),
    });

    if (!res.ok || !res.body) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errBody.error ?? `chat failed: ${res.status}`);
    }

    const sessionId = res.headers.get('x-atlas-session-id');
    if (!sessionId) {
      throw new Error('daemon did not return X-Atlas-Session-Id header');
    }

    return { sessionId, events: streamEvents(res.body) };
  }
}

async function* streamEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<AgentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseFrames(buffer);
      buffer = parsed.remaining;
      for (const event of parsed.events) yield event;
    }
    buffer += decoder.decode();
    const parsed = parseSseFrames(buffer);
    for (const event of parsed.events) yield event;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse SSE frames out of a buffer. Returns parsed events and the leftover
 * partial frame (if any) for the next read.
 *
 * Each frame is `event: <type>\ndata: <json>\n\n`. Malformed frames are
 * dropped silently rather than throwing — the daemon emits a separate
 * `error` event on real failures.
 */
export function parseSseFrames(buffer: string): {
  events: AgentEvent[];
  remaining: string;
} {
  const events: AgentEvent[] = [];
  let working = buffer.replace(/\r\n/g, '\n');
  let idx = working.indexOf('\n\n');
  while (idx !== -1) {
    const frame = working.slice(0, idx);
    working = working.slice(idx + 2);
    const parsed = parseFrame(frame);
    if (parsed) events.push(parsed);
    idx = working.indexOf('\n\n');
  }
  return { events, remaining: working };
}

function parseFrame(frame: string): AgentEvent | null {
  let eventType: string | undefined;
  let dataLine: string | undefined;
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
  }
  if (!eventType || dataLine === undefined) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(dataLine);
  } catch {
    return null;
  }
  return { type: eventType, ...payload } as AgentEvent;
}

