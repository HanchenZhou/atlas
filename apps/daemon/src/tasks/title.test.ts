import { describe, it, expect } from 'bun:test';
import { ProviderRegistry } from '../providers/registry';
import type { Provider, ChatRequest, AgentEvent } from '../providers/types';
import { RoleResolver } from '../roles/resolver';
import { generateTitle } from './title';

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

function harness(reply: string) {
  const r = new ProviderRegistry();
  r.register(makeProvider(reply));
  return {
    registry: r,
    resolver: new RoleResolver({ providerId: 'openai' }, {}),
  };
}

describe('generateTitle', () => {
  it('returns the model output trimmed', async () => {
    const h = harness('  Atlas Onboarding Walkthrough  ');
    expect(
      await generateTitle({ ...h, query: 'how do I start?', reply: 'do X' }),
    ).toBe('Atlas Onboarding Walkthrough');
  });

  it('strips wrapping quotes and trailing punctuation', async () => {
    const h = harness('"Setup walkthrough."');
    expect(
      await generateTitle({ ...h, query: 'q', reply: 'r' }),
    ).toBe('Setup walkthrough');
  });

  it('caps the title length', async () => {
    const long = 'a'.repeat(200);
    const h = harness(long);
    const out = await generateTitle({ ...h, query: 'q', reply: 'r' });
    expect(out.length).toBeLessThanOrEqual(60);
  });
});
