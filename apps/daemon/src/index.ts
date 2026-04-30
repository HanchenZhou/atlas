import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ProviderRegistry } from './providers/registry';
import { claudeCliProvider } from './providers/adapters/claude-cli';
import { openaiProvider } from './providers/adapters/openai';
import { kimiProvider } from './providers/adapters/kimi';
import { CredentialStore } from './providers/credentials';
import { providersRouter } from './http/providers';
import { chatRouter } from './http/chat';

export type BuildAppOptions = {
  registry?: ProviderRegistry;
};

export function buildApp(opts: BuildAppOptions = {}): Hono {
  const registry = opts.registry ?? createDefaultRegistry();

  const app = new Hono();
  app.use('*', cors({ origin: (o) => o, allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/providers', providersRouter(registry));
  app.route('/chat', chatRouter(registry));
  return app;
}

export function createDefaultRegistry(
  credentials: CredentialStore = new CredentialStore(),
): ProviderRegistry {
  const r = new ProviderRegistry();
  r.register(claudeCliProvider());
  r.register(openaiProvider(credentials));
  r.register(kimiProvider(credentials));
  return r;
}

export const app = buildApp();
