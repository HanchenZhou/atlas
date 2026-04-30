import { Hono } from 'hono';
import { z } from 'zod';
import type { ProviderRegistry } from '../providers/registry';
import type { AgentEvent, ProviderId } from '../providers/types';
import type { RoleResolver } from '../roles/resolver';
import type { FileSessionStore, Session } from '../sessions/store';
import { maybeCompact } from '../tasks/compaction';
import { generateTitle } from '../tasks/title';
import { sseStream } from './sse';

const chatRequestSchema = z.object({
  sessionId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  message: z.object({
    role: z.literal('user'),
    content: z.string().min(1),
  }),
});

export function chatRouter(
  registry: ProviderRegistry,
  store: FileSessionStore,
  roles: RoleResolver,
): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = chatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid request', issues: parsed.error.issues }, 400);
    }

    let session: Session;
    if (parsed.data.sessionId) {
      const existing = await store.get(parsed.data.sessionId);
      if (!existing) return c.json({ error: 'session not found' }, 404);
      session = existing;
    } else {
      if (!parsed.data.providerId) {
        return c.json(
          { error: 'providerId required when sessionId is omitted' },
          400,
        );
      }
      if (!registry.get(parsed.data.providerId)) {
        return c.json({ error: `unknown providerId: ${parsed.data.providerId}` }, 404);
      }
      session = await store.create({
        providerId: parsed.data.providerId,
        model: parsed.data.model,
      });
    }

    const provider = registry.get(session.providerId);
    if (!provider) {
      return c.json({ error: `unknown providerId: ${session.providerId}` }, 404);
    }

    session = await store.appendMessage(session.id, parsed.data.message);

    const compaction = await maybeCompact({
      registry,
      resolver: roles,
      messages: session.messages,
    });
    if (compaction.compacted) {
      session = await store.replaceMessages(session.id, compaction.messages);
    }

    const ac = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => ac.abort(), { once: true });

    const events = provider.chat({
      providerId: provider.id as ProviderId,
      model: parsed.data.model ?? session.model,
      messages: session.messages,
      signal: ac.signal,
    });

    const sessionId = session.id;
    const persisted = persistAssistant(events, async (text) => {
      if (text.length === 0) return;
      const updated = await store.appendMessage(sessionId, {
        role: 'assistant',
        content: text,
      });
      maybeGenerateTitle(updated, registry, roles, store);
    });

    return new Response(sseStream(persisted), {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-atlas-session-id': sessionId,
      },
    });
  });

  return app;
}

async function* persistAssistant(
  source: AsyncIterable<AgentEvent>,
  onComplete: (text: string) => Promise<void>,
): AsyncIterable<AgentEvent> {
  let buf = '';
  try {
    for await (const ev of source) {
      if (ev.type === 'text-delta') buf += ev.text;
      yield ev;
    }
  } finally {
    try {
      await onComplete(buf);
    } catch (err) {
      console.error('failed to persist assistant message:', err);
    }
  }
}

function maybeGenerateTitle(
  session: Session,
  registry: ProviderRegistry,
  roles: RoleResolver,
  store: FileSessionStore,
): void {
  const [first, second] = session.messages;
  if (
    session.messages.length !== 2 ||
    first?.role !== 'user' ||
    second?.role !== 'assistant'
  ) {
    return;
  }
  if (!roles.resolve('title').providerId) return;

  void generateTitle({
    registry,
    resolver: roles,
    query: first.content,
    reply: second.content,
  })
    .then((title) => {
      if (title.length > 0) return store.setTitle(session.id, title);
    })
    .catch((err) => {
      console.error('title generation failed:', err);
    });
}
