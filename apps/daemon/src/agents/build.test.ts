import { describe, it, expect } from 'bun:test';
import { ProviderRegistry } from '../providers/registry';
import type { Provider, ChatRequest, AgentEvent } from '../providers/types';
import { RoleResolver } from '../roles/resolver';
import { runBuild } from './build';
import type { PlanTask } from './types';

type Call = { messages: ChatRequest['messages'] };

function fakeProvider(replies: string[], log: Call[] = []): Provider {
  let i = 0;
  return {
    id: 'openai',
    displayName: 'openai',
    authMode: 'apiKey',
    status: async () => ({ loggedIn: true }),
    chat: function (req: ChatRequest): AsyncIterable<AgentEvent> {
      log.push({ messages: req.messages });
      const text = replies[i++] ?? 'ok';
      return (async function* () {
        yield { type: 'text-delta', text };
        yield { type: 'done' };
      })();
    },
  };
}

function tasks(...titles: string[]): PlanTask[] {
  return titles.map((t, i) => ({ id: `t${i + 1}`, title: t }));
}

async function collect(it: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe('runBuild', () => {
  it('streams task-start, taskId-tagged text-delta, task-done per task', async () => {
    const log: Call[] = [];
    const registry = new ProviderRegistry();
    registry.register(fakeProvider(['result A', 'result B'], log));
    const events = await collect(
      runBuild({
        registry,
        resolver: new RoleResolver({ providerId: 'openai' }, {}),
        sessionMessages: [{ role: 'user', content: 'do it' }],
        tasks: tasks('first step', 'second step'),
        sessionFallback: { providerId: 'openai' },
      }),
    );

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'task-start',
      'text-delta',
      'task-done',
      'task-start',
      'text-delta',
      'task-done',
      'done',
    ]);

    const deltas = events.filter(
      (e): e is Extract<AgentEvent, { type: 'text-delta' }> =>
        e.type === 'text-delta',
    );
    expect(deltas[0]?.taskId).toBe('t1');
    expect(deltas[0]?.text).toBe('result A');
    expect(deltas[1]?.taskId).toBe('t2');
    expect(deltas[1]?.text).toBe('result B');
  });

  it('feeds prior task results into subsequent provider calls', async () => {
    const log: Call[] = [];
    const registry = new ProviderRegistry();
    registry.register(fakeProvider(['result A', 'result B'], log));
    await collect(
      runBuild({
        registry,
        resolver: new RoleResolver({ providerId: 'openai' }, {}),
        sessionMessages: [{ role: 'user', content: 'original query' }],
        tasks: tasks('first step', 'second step'),
        sessionFallback: { providerId: 'openai' },
      }),
    );

    expect(log).toHaveLength(2);
    // The second call should see the first task's result in its context.
    const secondMessages = log[1]?.messages ?? [];
    const flat = secondMessages.map((m) => m.content).join('\n');
    expect(flat).toContain('original query');
    expect(flat).toContain('result A');
    expect(flat).toContain('second step');
  });

  it('emits task-done with ok:false and an error event when a task fails, then stops', async () => {
    const failing: Provider = {
      id: 'openai',
      displayName: 'openai',
      authMode: 'apiKey',
      status: async () => ({ loggedIn: true }),
      chat: function (): AsyncIterable<AgentEvent> {
        return (async function* () {
          yield { type: 'error', message: 'rate limit' };
        })();
      },
    };
    const registry = new ProviderRegistry();
    registry.register(failing);
    const events = await collect(
      runBuild({
        registry,
        resolver: new RoleResolver({ providerId: 'openai' }, {}),
        sessionMessages: [{ role: 'user', content: 'q' }],
        tasks: tasks('task 1', 'task 2'),
        sessionFallback: { providerId: 'openai' },
      }),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain('task-done');
    const done = events.find(
      (e): e is Extract<AgentEvent, { type: 'task-done' }> =>
        e.type === 'task-done',
    );
    expect(done?.ok).toBe(false);
    // Should not start the second task.
    expect(types.filter((t) => t === 'task-start')).toHaveLength(1);
    expect(types).toContain('error');
  });
});
