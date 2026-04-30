import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ProviderRegistry } from './providers/registry';
import { claudeCliProvider } from './providers/adapters/claude-cli';
import { openaiProvider } from './providers/adapters/openai';
import { CredentialStore } from './providers/credentials';
import { providersRouter } from './http/providers';
import { chatRouter } from './http/chat';

export type BuildAppOptions = {
  registry?: ProviderRegistry;
};

export function buildApp(opts: BuildAppOptions = {}): Hono {
  const registry = opts.registry ?? createDefaultRegistry();

  const app = new Hono();
  // The daemon is a localhost-only service spoken to by clients running on
  // the same machine (Electron renderer in dev = http://localhost:5173,
  // packaged Electron = file://; future Web app = http://localhost:3000).
  // Origin restriction adds no real security here — anything on this machine
  // can already talk to the port — so allow all origins for simplicity.
  app.use('*', cors({ origin: '*' }));
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
  return r;
}

export const app = buildApp();
