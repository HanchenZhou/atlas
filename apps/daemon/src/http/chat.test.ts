import { describe, it, expect } from 'bun:test';
import { buildApp } from '../index';
import type { Provider } from '../providers/types';
import { ProviderRegistry } from '../providers/registry';

function fakeProvider(): Provider {
  return {
    id: 'anthropic-claude-cli',
    displayName: 'Claude (fake)',
    authMode: 'cli-passthrough',
    status: async () => ({ loggedIn: true }),
    chat: async function* () {
      yield { type: 'text-delta', text: 'hello ' };
      yield { type: 'text-delta', text: 'world' };
      yield { type: 'done' };
    },
  };
}

function appWithFake(): ReturnType<typeof buildApp> {
  const registry = new ProviderRegistry();
  registry.register(fakeProvider());
  return buildApp({ registry });
}

describe('POST /chat', () => {
  it('returns 400 when body is invalid', async () => {
    const app = appWithFake();
    const res = await app.request('/chat', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when providerId is unknown', async () => {
    const app = appWithFake();
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        providerId: 'does-not-exist',
        messages: [{ role: 'user', content: 'hi' }],
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('streams SSE events for a known provider', async () => {
    const app = appWithFake();
    const res = await app.request('/chat', {
      method: 'POST',
      body: JSON.stringify({
        providerId: 'anthropic-claude-cli',
        messages: [{ role: 'user', content: 'hi' }],
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/event-stream');
    const body = await res.text();
    expect(body).toContain('event: text-delta');
    expect(body).toContain('"text":"hello "');
    expect(body).toContain('"text":"world"');
    expect(body).toContain('event: done');
  });
});
