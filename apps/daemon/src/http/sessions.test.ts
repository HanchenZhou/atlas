import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../index';
import { ProviderRegistry } from '../providers/registry';
import { FileSessionStore, type Session, type SessionSummary } from '../sessions/store';

let dir: string;
let store: FileSessionStore;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sessions-http-'));
  store = new FileSessionStore(dir);
  app = buildApp({ registry: new ProviderRegistry(), sessions: store });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /sessions', () => {
  it('returns [] when no sessions exist', async () => {
    const res = await app.request('/sessions');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns summaries (no messages) sorted by updatedAt desc', async () => {
    const a = await store.create({ providerId: 'openai', title: 'A' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.create({ providerId: 'openai', title: 'B' });
    const res = await app.request('/sessions');
    const json = (await res.json()) as SessionSummary[];
    expect(json.map((s) => s.id)).toEqual([b.id, a.id]);
    expect((json[0] as Record<string, unknown>).messages).toBeUndefined();
  });
});

describe('POST /sessions', () => {
  it('creates a session', async () => {
    const res = await app.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ providerId: 'openai', model: 'gpt-4o', title: 'hi' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Session;
    expect(body.providerId).toBe('openai');
    expect(body.model).toBe('gpt-4o');
    expect(body.title).toBe('hi');
    expect(body.messages).toEqual([]);
    expect(await store.get(body.id)).toBeDefined();
  });

  it('returns 400 when providerId missing', async () => {
    const res = await app.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'no provider' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /sessions/:id', () => {
  it('returns the full session', async () => {
    const s = await store.create({ providerId: 'openai' });
    const res = await app.request(`/sessions/${s.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(s);
  });

  it('returns 404 when unknown', async () => {
    const res = await app.request('/sessions/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /sessions/:id', () => {
  it('removes the session and returns 204', async () => {
    const s = await store.create({ providerId: 'openai' });
    const res = await app.request(`/sessions/${s.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await store.get(s.id)).toBeUndefined();
  });

  it('returns 204 even when unknown (idempotent)', async () => {
    const res = await app.request('/sessions/nope', { method: 'DELETE' });
    expect(res.status).toBe(204);
  });
});
