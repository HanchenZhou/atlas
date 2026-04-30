import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSessionStore } from './store';

let dir: string;
let store: FileSessionStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sessions-'));
  store = new FileSessionStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FileSessionStore.create', () => {
  it('creates a session with id, timestamps, and empty messages', async () => {
    const s = await store.create({ providerId: 'openai' });
    expect(s.id).toMatch(/.+/);
    expect(s.providerId).toBe('openai');
    expect(s.messages).toEqual([]);
    expect(s.createdAt).toBe(s.updatedAt);
    expect(s.title).toBe('');
  });

  it('persists model and title when provided', async () => {
    const s = await store.create({
      providerId: 'kimi',
      model: 'k2',
      title: 'hello',
    });
    expect(s.model).toBe('k2');
    expect(s.title).toBe('hello');
  });

  it('writes one file per session', async () => {
    const s = await store.create({ providerId: 'openai' });
    expect(readdirSync(dir)).toContain(`${s.id}.json`);
  });
});

describe('FileSessionStore.get', () => {
  it('returns undefined for unknown id', async () => {
    expect(await store.get('does-not-exist')).toBeUndefined();
  });

  it('round-trips a created session', async () => {
    const s = await store.create({ providerId: 'openai' });
    const got = await store.get(s.id);
    expect(got).toEqual(s);
  });
});

describe('FileSessionStore.list', () => {
  it('returns empty array when dir does not exist', async () => {
    const empty = new FileSessionStore(join(dir, 'missing'));
    expect(await empty.list()).toEqual([]);
  });

  it('omits messages and sorts by updatedAt desc', async () => {
    const a = await store.create({ providerId: 'openai', title: 'older' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.create({ providerId: 'openai', title: 'newer' });
    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
    expect((list[0] as Record<string, unknown>).messages).toBeUndefined();
  });
});

describe('FileSessionStore.appendMessage', () => {
  it('appends to messages and bumps updatedAt', async () => {
    const s = await store.create({ providerId: 'openai' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await store.appendMessage(s.id, {
      role: 'user',
      content: 'hi',
    });
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0]).toEqual({ role: 'user', content: 'hi' });
    expect(updated.updatedAt > s.updatedAt).toBe(true);
  });

  it('derives title from first user message when title is empty', async () => {
    const s = await store.create({ providerId: 'openai' });
    const updated = await store.appendMessage(s.id, {
      role: 'user',
      content: 'what is atlas?',
    });
    expect(updated.title).toBe('what is atlas?');
  });

  it('does not overwrite an existing title', async () => {
    const s = await store.create({ providerId: 'openai', title: 'kept' });
    const updated = await store.appendMessage(s.id, {
      role: 'user',
      content: 'something else',
    });
    expect(updated.title).toBe('kept');
  });

  it('throws when session is missing', async () => {
    await expect(
      store.appendMessage('nope', { role: 'user', content: 'x' }),
    ).rejects.toThrow(/nope/);
  });
});

describe('FileSessionStore.delete', () => {
  it('removes the session', async () => {
    const s = await store.create({ providerId: 'openai' });
    await store.delete(s.id);
    expect(await store.get(s.id)).toBeUndefined();
  });

  it('is a no-op for unknown id', async () => {
    await store.delete('nope');
  });
});
