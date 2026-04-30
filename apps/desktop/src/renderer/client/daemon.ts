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

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

  async *chat(req: {
    providerId: string;
    model?: string;
    messages: ChatMessage[];
    signal?: AbortSignal;
  }): AsyncIterable<AgentEvent> {
    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: req.providerId,
        ...(req.model && { model: req.model }),
        messages: req.messages,
      }),
      ...(req.signal && { signal: req.signal }),
    });

    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      yield { type: 'error', message: body.error ?? `chat failed: ${res.status}` };
      return;
    }

    const reader = res.body.getReader();
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
      // Flush final decoder buffer + any remaining frame.
      buffer += decoder.decode();
      const parsed = parseSseFrames(buffer);
      for (const event of parsed.events) yield event;
    } finally {
      reader.releaseLock();
    }
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
