import { streamText, type LanguageModel, type ModelMessage } from 'ai';
import type { AgentEvent, ChatMessage } from '../providers/types';

export type NativeLoopRequest = {
  model: LanguageModel;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

export async function* runNativeLoop(
  req: NativeLoopRequest,
): AsyncIterable<AgentEvent> {
  const result = streamText({
    model: req.model,
    messages: toModelMessages(req.messages),
    abortSignal: req.signal,
  });

  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          if (part.text) yield { type: 'text-delta', text: part.text };
          break;
        case 'tool-call':
          yield {
            type: 'tool-call',
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          };
          break;
        case 'tool-result':
          yield {
            type: 'tool-result',
            id: part.toolCallId,
            ok: true,
            result: part.output,
          };
          break;
        case 'tool-error':
          yield {
            type: 'tool-result',
            id: part.toolCallId,
            ok: false,
            error: String(part.error),
          };
          break;
        case 'error':
          yield {
            type: 'error',
            message:
              part.error instanceof Error
                ? part.error.message
                : String(part.error),
          };
          return;
        case 'abort':
          yield { type: 'error', message: part.reason ?? 'aborted' };
          return;
        case 'finish': {
          const usage = part.totalUsage;
          yield {
            type: 'done',
            billing: 'api',
            ...(usage && {
              usage: {
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
              },
            }),
          };
          return;
        }
      }
    }
    yield { type: 'done', billing: 'api' };
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
  }
}
