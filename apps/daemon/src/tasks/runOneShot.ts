import type { ProviderRegistry } from '../providers/registry';
import type { ChatMessage, ProviderId } from '../providers/types';
import type { RoleResolver } from '../roles/resolver';

export type RunOneShotInput = {
  registry: ProviderRegistry;
  resolver: RoleResolver;
  role: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

export async function runOneShot(input: RunOneShotInput): Promise<string> {
  const { providerId, model } = input.resolver.resolve(input.role);
  if (!providerId) {
    throw new Error(`role '${input.role}' has no providerId configured`);
  }
  const provider = input.registry.get(providerId);
  if (!provider) {
    throw new Error(`provider '${providerId}' is not registered`);
  }

  let buf = '';
  for await (const ev of provider.chat({
    providerId: provider.id as ProviderId,
    model,
    messages: input.messages,
    signal: input.signal,
  })) {
    if (ev.type === 'text-delta') buf += ev.text;
    else if (ev.type === 'error') throw new Error(ev.message);
  }
  return buf.trim();
}
