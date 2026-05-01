import type { ProviderRegistry } from '../providers/registry';
import type {
  AgentEvent,
  ChatMessage,
  ProviderId,
} from '../providers/types';
import type { RoleResolver } from '../roles/resolver';
import type { PlanTask } from './types';

export type SessionFallback = {
  providerId: string;
  model?: string;
};

export type RunBuildInput = {
  registry: ProviderRegistry;
  resolver: RoleResolver;
  sessionMessages: ChatMessage[];
  tasks: PlanTask[];
  sessionFallback: SessionFallback;
  signal?: AbortSignal;
};

const TASK_INSTRUCTION_PREFIX =
  'Now execute this task and respond with the result of this task only. Do not narrate the next step.';

export async function* runBuild(
  input: RunBuildInput,
): AsyncIterable<AgentEvent> {
  const { providerId, model } = resolveAgent(
    input.resolver,
    'build',
    input.sessionFallback,
  );
  const provider = input.registry.get(providerId);
  if (!provider) {
    yield { type: 'error', message: `provider '${providerId}' is not registered` };
    return;
  }

  const completed: Array<{ task: PlanTask; result: string }> = [];

  for (const task of input.tasks) {
    yield { type: 'task-start', id: task.id };

    const messages = composeTaskMessages(
      input.sessionMessages,
      completed,
      task,
    );

    let buf = '';
    let failed = false;
    let lastError: string | null = null;

    for await (const ev of provider.chat({
      providerId: provider.id as ProviderId,
      model,
      messages,
      signal: input.signal,
    })) {
      if (ev.type === 'text-delta') {
        buf += ev.text;
        yield { type: 'text-delta', text: ev.text, taskId: task.id };
      } else if (ev.type === 'error') {
        failed = true;
        lastError = ev.message;
        break;
      }
      // tool-call / tool-result are forwarded too, scoped by taskId? For now
      // build doesn't surface them — no tools wired yet.
    }

    yield { type: 'task-done', id: task.id, ok: !failed };

    if (failed) {
      yield { type: 'error', message: lastError ?? 'task failed' };
      return;
    }

    completed.push({ task, result: buf });
  }

  yield { type: 'done' };
}

function composeTaskMessages(
  sessionMessages: ChatMessage[],
  completed: Array<{ task: PlanTask; result: string }>,
  current: PlanTask,
): ChatMessage[] {
  const priorTaskNotes: ChatMessage[] = completed.flatMap(
    ({ task, result }) => [
      {
        role: 'assistant' as const,
        content: `[Completed task: ${task.title}]\n${result}`,
      },
    ],
  );

  const instruction = current.hint
    ? `${TASK_INSTRUCTION_PREFIX}\n\nTask: **${current.title}**\nDetail: ${current.hint}`
    : `${TASK_INSTRUCTION_PREFIX}\n\nTask: **${current.title}**`;

  return [
    ...sessionMessages,
    ...priorTaskNotes,
    { role: 'user', content: instruction },
  ];
}

function resolveAgent(
  resolver: RoleResolver,
  role: string,
  fallback: SessionFallback,
): { providerId: string; model?: string } {
  const r = resolver.resolve(role);
  return {
    providerId: r.providerId ?? fallback.providerId,
    model: r.model ?? fallback.model,
  };
}
