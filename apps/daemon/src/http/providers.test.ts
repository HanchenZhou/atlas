import { describe, it, expect } from 'bun:test';
import { buildApp } from '../index';
import type { Provider } from '../providers/types';
import { ProviderRegistry } from '../providers/registry';

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
  return buildApp({ registry });
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
