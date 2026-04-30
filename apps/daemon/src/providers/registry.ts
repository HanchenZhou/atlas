import type { Provider, ProviderId } from './types';

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, Provider>();

  register(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id as ProviderId);
  }

  list(): Provider[] {
    return [...this.providers.values()];
  }
}
