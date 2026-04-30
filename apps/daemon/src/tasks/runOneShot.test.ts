import { describe, it, expect } from 'bun:test';
import { ProviderRegistry } from '../providers/registry';
import type { Provider, ChatRequest, AgentEvent } from '../providers/types';
import { RoleResolver } from '../roles/resolver';
import { runOneShot } from './runOneShot';

function makeProvider(
  id: string,
  output: AgentEvent[],
): Provider {
  return {
    id: id as Provider['id'],
    displayName: id,
    authMode: 'apiKey',
    status: async () => ({ loggedIn: true }),
    chat: function (_req: ChatRequest): AsyncIterable<AgentEvent> {
      return (async function* () {
        for (const ev of output) yield ev;
      })();
    },
  };
}

function makeRegistry(...providers: Provider[]): ProviderRegistry {
  const r = new ProviderRegistry();
  for (const p of providers) r.register(p);
  return r;
}

describe('runOneShot', () => {
  it('joins text-delta events into a trimmed string', async () => {
    const registry = makeRegistry(
      makeProvider('openai', [
        { type: 'text-delta', text: '  Hello ' },
        { type: 'text-delta', text: 'world  ' },
        { type: 'done' },
      ]),
    );
    const resolver = new RoleResolver({ providerId: 'openai' }, {});
    const out = await runOneShot({
      registry,
      resolver,
      role: 'title',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out).toBe('Hello world');
  });

  it('throws when role has no providerId configured', async () => {
    const registry = makeRegistry();
    const resolver = new RoleResolver({}, {});
    await expect(
      runOneShot({
        registry,
        resolver,
        role: 'title',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/title/);
  });

  it('throws when provider is not registered', async () => {
    const registry = makeRegistry();
    const resolver = new RoleResolver({ providerId: 'ghost' }, {});
    await expect(
      runOneShot({
        registry,
        resolver,
        role: 'title',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/ghost/);
  });

  it('passes the resolved model to the provider', async () => {
    let capturedModel: string | undefined;
    const provider: Provider = {
      id: 'openai',
      displayName: 'openai',
      authMode: 'apiKey',
      status: async () => ({ loggedIn: true }),
      chat: function (req: ChatRequest): AsyncIterable<AgentEvent> {
        capturedModel = req.model;
        return (async function* () {
          yield { type: 'text-delta', text: 'ok' };
          yield { type: 'done' };
        })();
      },
    };
    const registry = makeRegistry(provider);
    const resolver = new RoleResolver(
      { providerId: 'openai', model: 'gpt-4o-mini' },
      { title: { model: 'gpt-4o-nano' } },
    );
    await runOneShot({
      registry,
      resolver,
      role: 'title',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(capturedModel).toBe('gpt-4o-nano');
  });

  it('throws when provider yields an error event', async () => {
    const registry = makeRegistry(
      makeProvider('openai', [
        { type: 'error', message: 'rate limit' },
      ]),
    );
    const resolver = new RoleResolver({ providerId: 'openai' }, {});
    await expect(
      runOneShot({
        registry,
        resolver,
        role: 'title',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/rate limit/);
  });
});
