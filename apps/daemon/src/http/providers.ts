import { Hono } from 'hono';
import type { ProviderRegistry } from '../providers/registry';

export function providersRouter(registry: ProviderRegistry): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const providers = await Promise.all(
      registry.list().map(async (p) => ({
        id: p.id,
        displayName: p.displayName,
        authMode: p.authMode,
        status: await p.status(),
      })),
    );
    return c.json(providers);
  });

  app.get('/:id/status', async (c) => {
    const provider = registry.get(c.req.param('id'));
    if (!provider) {
      return c.json({ error: 'unknown provider' }, 404);
    }
    return c.json(await provider.status());
  });

  return app;
}
