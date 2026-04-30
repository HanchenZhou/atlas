import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../index';
import type { Provider } from '../providers/types';
import { ProviderRegistry } from '../providers/registry';
import { RoleResolver } from '../roles/resolver';
import { FileSessionStore } from '../sessions/store';

let sessionsDir: string;

beforeEach(() => {
  sessionsDir = mkdtempSync(join(tmpdir(), 'atlas-providers-test-'));
});

afterEach(() => {
  rmSync(sessionsDir, { recursive: true, force: true });
});

function fakeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'anthropic-claude-cli',
    displayName: 'Claude (fake)',
    authMode: 'cli-passthrough',
    status: async () => ({ loggedIn: true, detail: 'subscription: pro' }),
    chat: async function* () {
      yield { type: 'done' };
    },
    ...overrides,
  };
}

function appWith(p: Provider): ReturnType<typeof buildApp> {
  const registry = new ProviderRegistry();
  registry.register(p);
  return buildApp({
    registry,
    sessions: new FileSessionStore(sessionsDir),
    roles: new RoleResolver({}, {}),
  });
}

describe('GET /providers', () => {
  it('lists registered providers with metadata and status', async () => {
    const app = appWith(fakeProvider());
    const res = await app.request('/providers');
    expect(res.status).toBe(200);
    const json = (await res.json()) as Array<{
      id: string;
      displayName: string;
      authMode: string;
      status: { loggedIn: boolean; detail?: string };
    }>;
    expect(json).toHaveLength(1);
    expect(json[0]?.id).toBe('anthropic-claude-cli');
    expect(json[0]?.authMode).toBe('cli-passthrough');
    expect(json[0]?.status.loggedIn).toBe(true);
    expect(json[0]?.status.detail).toBe('subscription: pro');
  });
});

describe('GET /providers/:id/status', () => {
  it('returns 200 + status for a known provider', async () => {
    const app = appWith(
      fakeProvider({
        status: async () => ({ loggedIn: false, detail: 'not logged in' }),
      }),
    );
    const res = await app.request('/providers/anthropic-claude-cli/status');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { loggedIn: boolean; detail?: string };
    expect(json.loggedIn).toBe(false);
    expect(json.detail).toBe('not logged in');
  });

  it('returns 404 for an unknown provider', async () => {
    const app = appWith(fakeProvider());
    const res = await app.request('/providers/nope/status');
    expect(res.status).toBe(404);
  });
});

describe('POST /providers/:id/login', () => {
  it('returns 405 when provider does not support login (cli-passthrough)', async () => {
    const app = appWith(fakeProvider());
    const res = await app.request('/providers/anthropic-claude-cli/login', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(405);
  });

  it('forwards the body to provider.login and returns 200', async () => {
    const captured: unknown[] = [];
    const app = appWith(
      fakeProvider({
        authMode: 'apiKey',
        login: async (input) => {
          captured.push(input);
        },
      }),
    );
    const res = await app.request('/providers/anthropic-claude-cli/login', {
      method: 'POST',
      body: JSON.stringify({ apiKey: 'sk-test' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(captured).toEqual([{ apiKey: 'sk-test' }]);
  });

  it('returns 400 when provider.login throws', async () => {
    const app = appWith(
      fakeProvider({
        authMode: 'apiKey',
        login: async () => {
          throw new Error('apiKey required');
        },
      }),
    );
    const res = await app.request('/providers/anthropic-claude-cli/login', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /providers/:id/credential', () => {
  it('returns 405 when provider does not support logout', async () => {
    const app = appWith(fakeProvider());
    const res = await app.request('/providers/anthropic-claude-cli/credential', {
      method: 'DELETE',
    });
    expect(res.status).toBe(405);
  });

  it('calls provider.logout and returns 204', async () => {
    let calls = 0;
    const app = appWith(
      fakeProvider({
        authMode: 'apiKey',
        logout: async () => {
          calls += 1;
        },
      }),
    );
    const res = await app.request('/providers/anthropic-claude-cli/credential', {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
    expect(calls).toBe(1);
  });
});

describe('CORS', () => {
  it('reflects Origin on a real request so the renderer can read the response', async () => {
    const app = appWith(fakeProvider());
    const res = await app.request('/providers', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    );
  });

  it('answers OPTIONS preflight for POST /providers/:id/login', async () => {
    const app = appWith(fakeProvider({ authMode: 'apiKey', login: async () => {} }));
    const res = await app.request('/providers/anthropic-claude-cli/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    );
    expect(res.headers.get('access-control-allow-methods') ?? '').toContain('POST');
  });
});
