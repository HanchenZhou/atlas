import { Hono } from 'hono';
import { z } from 'zod';
import type { FileSessionStore } from '../sessions/store';

const createSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1).optional(),
  title: z.string().optional(),
});

export function sessionsRouter(store: FileSessionStore): Hono {
  const app = new Hono();

  app.get('/', async (c) => c.json(await store.list()));

  app.get('/:id', async (c) => {
    const session = await store.get(c.req.param('id'));
    if (!session) return c.json({ error: 'session not found' }, 404);
    return c.json(session);
  });

  app.post('/', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid request', issues: parsed.error.issues }, 400);
    }
    const session = await store.create(parsed.data);
    return c.json(session, 201);
  });

  app.delete('/:id', async (c) => {
    await store.delete(c.req.param('id'));
    return c.body(null, 204);
  });

  return app;
}
