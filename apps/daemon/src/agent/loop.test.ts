import { describe, it, expect } from 'bun:test';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { runNativeLoop } from './loop';
import type { AgentEvent } from '../providers/types';

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

describe('runNativeLoop', () => {
  it('maps a successful stream to text-delta events and a done event', async () => {
    const chunks: LanguageModelV3StreamPart[] = [
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'hello ' },
      { type: 'text-delta', id: '1', delta: 'world' },
      { type: 'text-end', id: '1' },
      {
        type: 'finish',
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 2, text: 2, reasoning: 0 },
        },
        finishReason: { unified: 'stop', raw: 'stop' },
      },
    ];
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({ chunks }),
      }),
    });

    const events = await collect(
      runNativeLoop({
        model,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );

    const deltas = events.filter((e) => e.type === 'text-delta');
    expect(deltas).toEqual([
      { type: 'text-delta', text: 'hello ' },
      { type: 'text-delta', text: 'world' },
    ]);

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect(done?.type).toBe('done');
    if (done?.type === 'done') {
      expect(done.usage?.inputTokens).toBe(1);
      expect(done.usage?.outputTokens).toBe(2);
      expect(done.billing).toBe('api');
    }
  });

  it('emits an error event when the model fails', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => {
        throw new Error('boom');
      },
    });

    const events = await collect(
      runNativeLoop({
        model,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );

    const error = events.find((e) => e.type === 'error');
    expect(error?.type).toBe('error');
    if (error?.type === 'error') expect(error.message).toContain('boom');
  });
});
