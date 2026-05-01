import type { ProviderRegistry } from '../providers/registry';
import type {
  AgentEvent,
  ChatMessage,
  ProviderId,
} from '../providers/types';
import type { RoleResolver } from '../roles/resolver';
import { runBuild, type SessionFallback } from './build';
import { runPlan } from './plan';

export type RunChatInput = {
  registry: ProviderRegistry;
  resolver: RoleResolver;
  sessionMessages: ChatMessage[];
  sessionFallback: SessionFallback;
  signal?: AbortSignal;
};

export async function* runChat(
  input: RunChatInput,
): AsyncIterable<AgentEvent> {
  const plan = await runPlan({
    registry: input.registry,
    resolver: input.resolver,
    messages: input.sessionMessages,
    signal: input.signal,
  });

  if (plan.kind === 'tasks') {
    yield {
      type: 'plan',
      tasks: plan.tasks.map((t) => {
        const out: { id: string; title: string; hint?: string } = {
          id: t.id,
          title: t.title,
        };
        if (t.hint) out.hint = t.hint;
        return out;
      }),
    };
    yield* runBuild({
      registry: input.registry,
      resolver: input.resolver,
      sessionMessages: input.sessionMessages,
      tasks: plan.tasks,
      sessionFallback: input.sessionFallback,
      signal: input.signal,
    });
    return;
  }

  // Direct path: stream the build provider once with the original messages.
  const buildResolved = input.resolver.resolve('build');
  const providerId = buildResolved.providerId ?? input.sessionFallback.providerId;
  const model = buildResolved.model ?? input.sessionFallback.model;
  const provider = input.registry.get(providerId);
  if (!provider) {
    yield { type: 'error', message: `provider '${providerId}' is not registered` };
    return;
  }

  yield* provider.chat({
    providerId: provider.id as ProviderId,
    model,
    messages: input.sessionMessages,
    signal: input.signal,
  });
}
