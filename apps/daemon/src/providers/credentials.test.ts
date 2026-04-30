import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from './credentials';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-cred-'));
  file = join(dir, 'credentials.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('CredentialStore', () => {
  it('returns undefined when no credential is stored', async () => {
    const store = new CredentialStore(file);
    expect(await store.get('openai')).toBeUndefined();
  });

  it('round-trips a credential', async () => {
    const store = new CredentialStore(file);
    await store.set('openai', { apiKey: 'sk-test' });
    const got = await store.get('openai');
    expect(got).toEqual({ apiKey: 'sk-test' });
  });

  it('persists between instances', async () => {
    await new CredentialStore(file).set('openai', { apiKey: 'sk-test' });
    const got = await new CredentialStore(file).get('openai');
    expect(got).toEqual({ apiKey: 'sk-test' });
  });

  it('writes the credentials file with mode 0600', async () => {
    const store = new CredentialStore(file);
    await store.set('openai', { apiKey: 'sk-test' });
    expect(existsSync(file)).toBe(true);
    const mode = statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('removes a credential', async () => {
    const store = new CredentialStore(file);
    await store.set('openai', { apiKey: 'sk-test' });
    await store.delete('openai');
    expect(await store.get('openai')).toBeUndefined();
  });
});
