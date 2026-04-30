import type { ProviderRegistry } from '../providers/registry';
import type { ChatMessage } from '../providers/types';
import type { RoleResolver } from '../roles/resolver';
import { runOneShot } from './runOneShot';

const DEFAULT_THRESHOLD_CHARS = 32_000;
const DEFAULT_KEEP_RECENT = 4;

const SYSTEM_PROMPT =
  'You compress conversation histories. Output 2-4 short paragraphs of plain prose summarizing the key facts, decisions, code identifiers, and any open threads. No markdown headers or bullet lists.';

export type MaybeCompactInput = {
  registry: ProviderRegistry;
  resolver: RoleResolver;
  messages: ChatMessage[];
  thresholdChars?: number;
  keepRecent?: number;
  signal?: AbortSignal;
};

export type CompactionResult = {
  compacted: boolean;
  messages: ChatMessage[];
};

export async function maybeCompact(
  input: MaybeCompactInput,
): Promise<CompactionResult> {
  const threshold = input.thresholdChars ?? DEFAULT_THRESHOLD_CHARS;
  const keep = input.keepRecent ?? DEFAULT_KEEP_RECENT;

  if (totalChars(input.messages) <= threshold) {
    return { compacted: false, messages: input.messages };
  }
  if (input.messages.length <= keep + 1) {
    return { compacted: false, messages: input.messages };
  }
  if (!input.resolver.resolve('compaction').providerId) {
    return { compacted: false, messages: input.messages };
  }

  const olderEnd = input.messages.length - keep;
  const older = input.messages.slice(0, olderEnd);
  const recent = input.messages.slice(olderEnd);

  const transcript = older
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n\n');

  let summary: string;
  try {
    summary = await runOneShot({
      registry: input.registry,
      resolver: input.resolver,
      role: 'compaction',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Summarize the following conversation history:\n\n${transcript}`,
        },
      ],
      signal: input.signal,
    });
  } catch (err) {
    console.warn('compaction failed, proceeding with full history:', err);
    return { compacted: false, messages: input.messages };
  }

  if (!summary) {
    return { compacted: false, messages: input.messages };
  }

  return {
    compacted: true,
    messages: [
      {
        role: 'system',
        content: `[Earlier conversation summary]\n${summary}`,
      },
      ...recent,
    ],
  };
}

function totalChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}
