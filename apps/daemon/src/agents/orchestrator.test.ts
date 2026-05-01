import { describe, it, expect } from 'bun:test';
import { ProviderRegistry } from '../providers/registry';
import type { Provider, ChatRequest, AgentEvent } from '../providers/types';
import { RoleResolver } from '../roles/resolver';
import { runChat } from './orchestrator';

function sequenceProvider(replies: string[]): Provider {
  let i = 0;
  return {
    id: 'openai',
    displayName: 'openai',
    authMode: 'apiKey',
    status: async () => ({ loggedIn: true }),
    chat: function (_req: ChatRequest): AsyncIterable<AgentEvent> {
      const text = replies[i++] ?? '';
      return (async function* () {
        if (text) yield { type: 'text-delta', text };
        yield { type: 'done' };
      })();
    },
  };
}

async function collect(
  it: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe('runChat (orchestrator)', () => {
  const sessionFallback = { providerId: 'openai' };

  it('takes the direct path when plan returns direct', async () => {
    const registry = new ProviderRegistry();
    registry.register(sequenceProvider(['{"kind":"direct"}', 'hello world']));
    const events = await collect(
      runChat({
        registry,
        resolver: new RoleResolver({ providerId: 'openai' }, {}),
        sessionMessages: [{ role: 'user', content: 'simple question' }],
        sessionFallback,
      }),
    );
    const types = events.map((e) => e.type);
    expect(types).not.toContain('plan');
    expect(types).not.toContain('task-start');
    expect(types).toContain('text-delta');
    expect(types[types.length - 1]).toBe('done');
  });

  it('takes the planned path when plan returns tasks', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      sequenceProvider([
        '{"kind":"tasks","tasks":[{"title":"first"},{"title":"second"}]}',
        'result of first',
        'result of second',
      ]),
    );
    const events = await collect(
      runChat({
        registry,
        resolver: new RoleResolver({ providerId: 'openai' }, {}),
        sessionMessages: [{ role: 'user', content: 'multi-step ask' }],
        sessionFallback,
      }),
    );

    const planEv = events.find((e) => e.type === 'plan') as
      | Extract<AgentEvent, { type: 'plan' }>
      | undefined;
    expect(planEv?.tasks).toHaveLength(2);
    expect(planEv?.tasks[0]?.title).toBe('first');

    const taskStarts = events.filter((e) => e.type === 'task-start');
    expect(taskStarts).toHaveLength(2);
    expect(events[events.length - 1]?.type).toBe('done');
  });

  it('falls back to direct when plan role is unconfigured', async () => {
    const registry = new ProviderRegistry();
    registry.register(sequenceProvider(['plain answer']));
    const events = await collect(
      runChat({
        registry,
        resolver: new RoleResolver({}, {}),
        sessionMessages: [{ role: 'user', content: 'hi' }],
        sessionFallback,
      }),
    );
    const types = events.map((e) => e.type);
    expect(types).not.toContain('plan');
    expect(types).toContain('text-delta');
  });
});
