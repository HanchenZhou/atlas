import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from '../credentials';
import { kimiProvider } from './kimi';

let dir: string;
let store: CredentialStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-kimi-'));
  store = new CredentialStore(join(dir, 'credentials.json'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('kimiProvider', () => {
  it('exposes Moonshot defaults via id/displayName/authMode', () => {
    const provider = kimiProvider(store);
    expect(provider.id).toBe('kimi');
    expect(provider.authMode).toBe('apiKey');
    expect(provider.displayName.toLowerCase()).toContain('kimi');
  });

  it('reports loggedIn=false when no credential is stored', async () => {
    const provider = kimiProvider(store);
    const status = await provider.status();
    expect(status.loggedIn).toBe(false);
  });

  it('reports loggedIn=true when a credential is stored', async () => {
    await store.set('kimi', { apiKey: 'sk-test' });
    const provider = kimiProvider(store);
    const status = await provider.status();
    expect(status.loggedIn).toBe(true);
  });

  it('login validates that apiKey is a non-empty string', async () => {
    const provider = kimiProvider(store);
    await expect(provider.login!({})).rejects.toThrow();
    await expect(provider.login!({ apiKey: '' })).rejects.toThrow();
    expect(await store.get('kimi')).toBeUndefined();
  });

  it('login only persists apiKey — baseUrl is hardcoded to the coding plan endpoint', async () => {
    const provider = kimiProvider(store);
    await provider.login!({
      apiKey: 'sk-real',
      baseUrl: 'https://elsewhere.example/v1',
    });
    expect(await store.get('kimi')).toEqual({ apiKey: 'sk-real' });
  });

  it('logout removes the stored credential', async () => {
    const provider = kimiProvider(store);
    await provider.login!({ apiKey: 'sk-real' });
    await provider.logout!();
    expect(await store.get('kimi')).toBeUndefined();
  });

  it('chat yields an error event when no credential is configured', async () => {
    const provider = kimiProvider(store);
    const events: Array<{ type: string; message?: string }> = [];
    for await (const ev of provider.chat({
      providerId: 'kimi',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      events.push(ev as { type: string; message?: string });
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
    expect(events[0]?.message).toContain('not logged in');
  });
});
