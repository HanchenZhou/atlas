import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from '../credentials';
import { openaiProvider } from './openai';

let dir: string;
let store: CredentialStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-openai-'));
  store = new CredentialStore(join(dir, 'credentials.json'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openaiProvider', () => {
  it('reports loggedIn=false when no credential is stored', async () => {
    const provider = openaiProvider(store);
    const status = await provider.status();
    expect(status.loggedIn).toBe(false);
  });

  it('reports loggedIn=true when a credential is stored', async () => {
    await store.set('openai', { apiKey: 'sk-test' });
    const provider = openaiProvider(store);
    const status = await provider.status();
    expect(status.loggedIn).toBe(true);
  });

  it('login validates that apiKey is a non-empty string', async () => {
    const provider = openaiProvider(store);
    await expect(provider.login!({})).rejects.toThrow();
    await expect(provider.login!({ apiKey: '' })).rejects.toThrow();
    expect(await store.get('openai')).toBeUndefined();
  });

  it('login persists apiKey + optional baseUrl', async () => {
    const provider = openaiProvider(store);
    await provider.login!({ apiKey: 'sk-real', baseUrl: 'https://api.qwen.com/v1' });
    expect(await store.get('openai')).toEqual({
      apiKey: 'sk-real',
      baseUrl: 'https://api.qwen.com/v1',
    });
  });

  it('logout removes the stored credential', async () => {
    const provider = openaiProvider(store);
    await provider.login!({ apiKey: 'sk-real' });
    await provider.logout!();
    expect(await store.get('openai')).toBeUndefined();
  });

  it('chat yields an error event when no credential is configured', async () => {
    const provider = openaiProvider(store);
    const events: Array<{ type: string; message?: string }> = [];
    for await (const ev of provider.chat({
      providerId: 'openai',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      events.push(ev as { type: string; message?: string });
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.message).toContain('not logged in');
  });
});
