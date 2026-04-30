import { Hono } from 'hono';
import { z } from 'zod';
import type { ProviderRegistry } from '../providers/registry';
import { sseStream } from './sse';

const chatRequestSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .min(1),
});

export function chatRouter(registry: ProviderRegistry): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid request', issues: parsed.error.issues }, 400);
    }

    const provider = registry.get(parsed.data.providerId);
    if (!provider) {
      return c.json({ error: `unknown providerId: ${parsed.data.providerId}` }, 404);
    }

    const ac = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => ac.abort(), { once: true });

    const stream = sseStream(
      provider.chat({
        providerId: provider.id,
        model: parsed.data.model,
        messages: parsed.data.messages,
        signal: ac.signal,
      }),
    );

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });

  return app;
}
