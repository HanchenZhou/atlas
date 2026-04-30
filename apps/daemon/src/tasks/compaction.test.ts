import { describe, it, expect } from 'bun:test';
import { ProviderRegistry } from '../providers/registry';
import type { Provider, ChatRequest, AgentEvent, ChatMessage } from '../providers/types';
import { RoleResolver } from '../roles/resolver';
import { maybeCompact } from './compaction';

function makeProvider(reply: string): Provider {
  return {
    id: 'openai',
    displayName: 'openai',
    authMode: 'apiKey',
    status: async () => ({ loggedIn: true }),
    chat: function (_req: ChatRequest): AsyncIterable<AgentEvent> {
      return (async function* () {
        yield { type: 'text-delta', text: reply };
        yield { type: 'done' };
      })();
    },
  };
}

function makeRegistry(provider: Provider): ProviderRegistry {
  const r = new ProviderRegistry();
  r.register(provider);
  return r;
}

function bigMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return { role, content };
}

describe('maybeCompact', () => {
  const resolver = new RoleResolver({ providerId: 'openai' }, {});

  it('returns the original messages when total chars stay under threshold', async () => {
    const messages: ChatMessage[] = [
      bigMessage('user', 'a'),
      bigMessage('assistant', 'b'),
      bigMessage('user', 'c'),
    ];
    const out = await maybeCompact({
      registry: makeRegistry(makeProvider('summary')),
      resolver,
      messages,
      thresholdChars: 100,
      keepRecent: 2,
    });
    expect(out.compacted).toBe(false);
    expect(out.messages).toEqual(messages);
  });

  it('returns the original messages when there are fewer than keep + 1', async () => {
    const messages: ChatMessage[] = [
      bigMessage('user', 'a'.repeat(500)),
      bigMessage('assistant', 'b'.repeat(500)),
    ];
    const out = await maybeCompact({
      registry: makeRegistry(makeProvider('summary')),
      resolver,
      messages,
      thresholdChars: 100,
      keepRecent: 4,
    });
    expect(out.compacted).toBe(false);
    expect(out.messages).toEqual(messages);
  });

  it('replaces older messages with a system summary and keeps the recent ones', async () => {
    const messages: ChatMessage[] = [
      bigMessage('user', 'old-1 ' + 'x'.repeat(200)),
      bigMessage('assistant', 'old-2 ' + 'x'.repeat(200)),
      bigMessage('user', 'old-3 ' + 'x'.repeat(200)),
      bigMessage('assistant', 'old-4 ' + 'x'.repeat(200)),
      bigMessage('user', 'recent-A'),
      bigMessage('assistant', 'recent-B'),
      bigMessage('user', 'recent-C'),
    ];
    const out = await maybeCompact({
      registry: makeRegistry(makeProvider('Earlier work covered topics X and Y.')),
      resolver,
      messages,
      thresholdChars: 100,
      keepRecent: 3,
    });
    expect(out.compacted).toBe(true);
    expect(out.messages).toHaveLength(4);
    expect(out.messages[0]?.role).toBe('system');
    expect(out.messages[0]?.content).toContain(
      'Earlier work covered topics X and Y.',
    );
    expect(out.messages.slice(1)).toEqual([
      bigMessage('user', 'recent-A'),
      bigMessage('assistant', 'recent-B'),
      bigMessage('user', 'recent-C'),
    ]);
  });

  it('falls back to the original messages when the LLM call fails', async () => {
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
    const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) =>
      bigMessage(i % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(100)),
    );
    const out = await maybeCompact({
      registry: makeRegistry(failing),
      resolver,
      messages,
      thresholdChars: 100,
      keepRecent: 3,
    });
    expect(out.compacted).toBe(false);
    expect(out.messages).toEqual(messages);
  });

  it('falls back when compaction role has no providerId', async () => {
    const noResolver = new RoleResolver({}, {});
    const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) =>
      bigMessage(i % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(100)),
    );
    const out = await maybeCompact({
      registry: makeRegistry(makeProvider('summary')),
      resolver: noResolver,
      messages,
      thresholdChars: 100,
      keepRecent: 3,
    });
    expect(out.compacted).toBe(false);
    expect(out.messages).toEqual(messages);
  });
});
