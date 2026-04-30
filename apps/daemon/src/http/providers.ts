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

  app.post('/:id/login', async (c) => {
    const provider = registry.get(c.req.param('id'));
    if (!provider) {
      return c.json({ error: 'unknown provider' }, 404);
    }
    if (!provider.login) {
      return c.json(
        { error: 'login not supported', authMode: provider.authMode },
        405,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    try {
      await provider.login(body);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete('/:id/credential', async (c) => {
    const provider = registry.get(c.req.param('id'));
    if (!provider) {
      return c.json({ error: 'unknown provider' }, 404);
    }
    if (!provider.logout) {
      return c.json({ error: 'logout not supported' }, 405);
    }
    await provider.logout();
    return c.body(null, 204);
  });

  return app;
}
