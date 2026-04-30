import type { ProviderRegistry } from '../providers/registry';
import type { RoleResolver } from '../roles/resolver';
import { runOneShot } from './runOneShot';

const MAX_TITLE_LEN = 60;
const SYSTEM_PROMPT =
  'You generate short conversation titles. Output 3 to 6 words that summarize the topic. No quotes, no surrounding punctuation, no trailing period.';
const FOLLOW_UP =
  'Now give me a 3-6 word title for this conversation. Output only the title.';

export type GenerateTitleInput = {
  registry: ProviderRegistry;
  resolver: RoleResolver;
  query: string;
  reply: string;
  signal?: AbortSignal;
};

export async function generateTitle(input: GenerateTitleInput): Promise<string> {
  const text = await runOneShot({
    registry: input.registry,
    resolver: input.resolver,
    role: 'title',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: input.query.slice(0, 500) },
      { role: 'assistant', content: input.reply.slice(0, 500) },
      { role: 'user', content: FOLLOW_UP },
    ],
    signal: input.signal,
  });
  return sanitize(text);
}

function sanitize(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`*\s]+|["'`*.!?\s]+$/g, '')
    .slice(0, MAX_TITLE_LEN);
}
