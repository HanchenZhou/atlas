import type { ProviderRegistry } from '../providers/registry';
import type { ChatMessage } from '../providers/types';
import type { RoleResolver } from '../roles/resolver';
import { runOneShot } from '../tasks/runOneShot';
import type { PlanResult, PlanTask } from './types';

const SYSTEM_PROMPT = [
  'You are a planner. Look at the user\'s most recent request and decide if it needs multi-step decomposition.',
  '',
  'If the request is simple (a question, a definition, basic chat, a single edit), respond with EXACTLY:',
  '{"kind":"direct"}',
  '',
  'If the request needs multiple steps (research, comparison across sources, building something with several parts), respond with:',
  '{"kind":"tasks","tasks":[{"title":"<4-8 word phrase>","hint":"<one sentence detail, optional>"}, ...]}',
  '',
  'Use 2 to 5 tasks. Each title is short and user-readable. Output ONLY the JSON. No code fences, no preamble, no trailing text.',
].join('\n');

export type RunPlanInput = {
  registry: ProviderRegistry;
  resolver: RoleResolver;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

export async function runPlan(input: RunPlanInput): Promise<PlanResult> {
  if (!input.resolver.resolve('plan').providerId) {
    return { kind: 'direct' };
  }

  let raw: string;
  try {
    raw = await runOneShot({
      registry: input.registry,
      resolver: input.resolver,
      role: 'plan',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...input.messages,
      ],
      signal: input.signal,
    });
  } catch (err) {
    console.warn('plan generation failed, falling back to direct:', err);
    return { kind: 'direct' };
  }

  return parsePlan(raw);
}

export function parsePlan(raw: string): PlanResult {
  const cleaned = stripCodeFence(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { kind: 'direct' };
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { kind?: unknown }).kind === 'direct'
  ) {
    return { kind: 'direct' };
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { kind?: unknown }).kind === 'tasks' &&
    Array.isArray((parsed as { tasks?: unknown }).tasks)
  ) {
    const rawTasks = (parsed as { tasks: unknown[] }).tasks;
    const tasks: PlanTask[] = [];
    for (const t of rawTasks) {
      if (typeof t !== 'object' || t === null) continue;
      const title = (t as { title?: unknown }).title;
      if (typeof title !== 'string' || title.length === 0) continue;
      const hintRaw = (t as { hint?: unknown }).hint;
      const task: PlanTask = {
        id: crypto.randomUUID(),
        title,
      };
      if (typeof hintRaw === 'string' && hintRaw.length > 0) {
        task.hint = hintRaw;
      }
      tasks.push(task);
    }
    if (tasks.length === 0) return { kind: 'direct' };
    return { kind: 'tasks', tasks };
  }

  return { kind: 'direct' };
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/m);
  if (fenced && fenced[1]) return fenced[1];
  return text;
}
