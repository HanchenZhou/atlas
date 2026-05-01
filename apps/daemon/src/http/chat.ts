import { Hono } from 'hono';
import { z } from 'zod';
import { runChat } from '../agents/orchestrator';
import type { TaskRecord } from '../agents/types';
import type { ProviderRegistry } from '../providers/registry';
import type { AgentEvent } from '../providers/types';
import type { RoleResolver } from '../roles/resolver';
import type {
  FileSessionStore,
  Session,
  SessionMessage,
} from '../sessions/store';
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

    if (!registry.get(session.providerId)) {
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

    const events = runChat({
      registry,
      resolver: roles,
      sessionMessages: session.messages,
      sessionFallback: {
        providerId: session.providerId,
        model: parsed.data.model ?? session.model,
      },
      signal: ac.signal,
    });

    const sessionId = session.id;
    const persisted = persistAssistant(events, async (collected) => {
      if (collected.content.length === 0 && !collected.plan) return;
      const msg: SessionMessage = {
        role: 'assistant',
        content: collected.content,
      };
      if (collected.plan) msg.plan = collected.plan;
      const updated = await store.appendMessage(sessionId, msg);
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

type CollectedAssistant = {
  content: string;
  plan?: { tasks: TaskRecord[] };
};

async function* persistAssistant(
  source: AsyncIterable<AgentEvent>,
  onComplete: (collected: CollectedAssistant) => Promise<void>,
): AsyncIterable<AgentEvent> {
  const collector = createCollector();
  try {
    for await (const ev of source) {
      collector.observe(ev);
      yield ev;
    }
  } finally {
    try {
      await onComplete(collector.result());
    } catch (err) {
      console.error('failed to persist assistant message:', err);
    }
  }
}

function createCollector(): {
  observe(ev: AgentEvent): void;
  result(): CollectedAssistant;
} {
  let directBuf = '';
  let planTasks: Array<{ id: string; title: string; hint?: string }> | null =
    null;
  const taskBufs = new Map<string, string>();
  const taskStatus = new Map<string, 'done' | 'failed'>();

  return {
    observe(ev) {
      if (ev.type === 'plan') {
        planTasks = ev.tasks;
        return;
      }
      if (ev.type === 'text-delta') {
        if (ev.taskId) {
          taskBufs.set(ev.taskId, (taskBufs.get(ev.taskId) ?? '') + ev.text);
        } else {
          directBuf += ev.text;
        }
        return;
      }
      if (ev.type === 'task-done') {
        taskStatus.set(ev.id, ev.ok ? 'done' : 'failed');
      }
    },
    result() {
      if (!planTasks) return { content: directBuf };
      const tasks: TaskRecord[] = planTasks.map((t) => {
        const rec: TaskRecord = {
          id: t.id,
          title: t.title,
          status: taskStatus.get(t.id) ?? 'failed',
          result: taskBufs.get(t.id) ?? '',
        };
        if (t.hint) rec.hint = t.hint;
        return rec;
      });
      const content = tasks
        .map((t) => t.result)
        .filter((r) => r.length > 0)
        .join('\n\n');
      return { content, plan: { tasks } };
    },
  };
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
