import { Hono } from 'hono';
import { ProviderRegistry } from './providers/registry';
import { claudeCliProvider } from './providers/adapters/claude-cli';
import { providersRouter } from './http/providers';
import { chatRouter } from './http/chat';

export type BuildAppOptions = {
  registry?: ProviderRegistry;
};

export function buildApp(opts: BuildAppOptions = {}): Hono {
  const registry = opts.registry ?? createDefaultRegistry();

  const app = new Hono();
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/providers', providersRouter(registry));
  app.route('/chat', chatRouter(registry));
  return app;
}

export function createDefaultRegistry(): ProviderRegistry {
  const r = new ProviderRegistry();
  r.register(claudeCliProvider());
  return r;
}

export const app = buildApp();
