import { describe, it, expect } from 'bun:test';
import { ProviderRegistry } from '../providers/registry';
import type { Provider, ChatRequest, AgentEvent } from '../providers/types';
import { RoleResolver } from '../roles/resolver';
import { runPlan } from './plan';

function reply(text: string): Provider {
  return {
    id: 'openai',
    displayName: 'openai',
    authMode: 'apiKey',
    status: async () => ({ loggedIn: true }),
    chat: function (_req: ChatRequest): AsyncIterable<AgentEvent> {
      return (async function* () {
        yield { type: 'text-delta', text };
        yield { type: 'done' };
      })();
    },
  };
}

function harness(text: string) {
  const r = new ProviderRegistry();
  r.register(reply(text));
  return {
    registry: r,
    resolver: new RoleResolver({ providerId: 'openai' }, {}),
  };
}

describe('runPlan', () => {
  it('parses {kind:"direct"} and returns direct', async () => {
    const out = await runPlan({
      ...harness('{"kind":"direct"}'),
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out).toEqual({ kind: 'direct' });
  });

  it('parses tasks JSON and assigns ids', async () => {
    const out = await runPlan({
      ...harness(
        '{"kind":"tasks","tasks":[{"title":"first step"},{"title":"second step","hint":"detail"}]}',
      ),
      messages: [{ role: 'user', content: 'do something complex' }],
    });
    expect(out.kind).toBe('tasks');
    if (out.kind !== 'tasks') return;
    expect(out.tasks).toHaveLength(2);
    expect(out.tasks[0]?.title).toBe('first step');
    expect(out.tasks[1]?.hint).toBe('detail');
    expect(out.tasks[0]?.id).toMatch(/.+/);
    expect(out.tasks[0]?.id).not.toBe(out.tasks[1]?.id);
  });

  it('strips ```json fences before parsing', async () => {
    const out = await runPlan({
      ...harness('```json\n{"kind":"direct"}\n```'),
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out).toEqual({ kind: 'direct' });
  });

  it('falls back to direct on malformed JSON', async () => {
    const out = await runPlan({
      ...harness('this is not json'),
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out).toEqual({ kind: 'direct' });
  });

  it('falls back to direct when plan role is unconfigured', async () => {
    const r = new ProviderRegistry();
    r.register(reply('{"kind":"tasks","tasks":[{"title":"x"}]}'));
    const out = await runPlan({
      registry: r,
      resolver: new RoleResolver({}, {}),
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out).toEqual({ kind: 'direct' });
  });

  it('falls back to direct when tasks list is empty', async () => {
    const out = await runPlan({
      ...harness('{"kind":"tasks","tasks":[]}'),
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out).toEqual({ kind: 'direct' });
  });
});
