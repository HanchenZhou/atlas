import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ProviderRegistry } from './providers/registry';
import { claudeCliProvider } from './providers/adapters/claude-cli';
import { openaiProvider } from './providers/adapters/openai';
import { kimiProvider } from './providers/adapters/kimi';
import { CredentialStore } from './providers/credentials';
import { FileSessionStore } from './sessions/store';
import { providersRouter } from './http/providers';
import { chatRouter } from './http/chat';
import { sessionsRouter } from './http/sessions';

export type BuildAppOptions = {
  registry: ProviderRegistry;
  sessions: FileSessionStore;
};

export function buildApp(opts: BuildAppOptions): Hono {
  const { registry, sessions } = opts;
  const app = new Hono();
  app.use(
    '*',
    cors({
      origin: (o) => o,
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['x-atlas-session-id'],
    }),
  );
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/providers', providersRouter(registry));
  app.route('/chat', chatRouter(registry, sessions));
  app.route('/sessions', sessionsRouter(sessions));
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
