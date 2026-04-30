import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentEvent,
  ChatRequest,
  Provider,
  ProviderStatus,
} from '../types';

const execFileAsync = promisify(execFile);

function buildSubscriptionEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

function messagesToPrompt(messages: ChatRequest['messages']): string {
  // Claude SDK 接受单个 prompt string 或 AsyncIterable<SDKUserMessage>。
  // 早期阶段我们只支持单轮：取最后一条 user 消息直接交给 SDK。
  // 多轮历史要走 SDK 的 resume/session 机制，留给后续 issue。
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') return m.content;
  }
  throw new Error('chat request must contain at least one user message');
}

type AuthStatusJson = {
  loggedIn?: boolean;
  subscriptionType?: string;
  email?: string;
};

export function parseAuthStatus(stdout: string): ProviderStatus {
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as AuthStatusJson;
      if (typeof parsed.loggedIn === 'boolean') {
        const parts: string[] = [];
        if (parsed.subscriptionType) {
          parts.push(`subscription: ${parsed.subscriptionType}`);
        }
        if (parsed.email) parts.push(parsed.email);
        const detail = parts.join(' · ');
        return { loggedIn: parsed.loggedIn, ...(detail && { detail }) };
      }
    } catch {
      // Not valid JSON; fall through to legacy text parsing.
    }
  }

  const loggedIn = /logged in/i.test(trimmed);
  const subscription = /subscription:\s*(\w+)/i.exec(trimmed)?.[1];
  return {
    loggedIn,
    ...(subscription
      ? { detail: `subscription: ${subscription}` }
      : trimmed
        ? { detail: trimmed }
        : {}),
  };
}

async function detectStatus(): Promise<ProviderStatus> {
  try {
    const { stdout } = await execFileAsync('claude', ['auth', 'status'], {
      timeout: 10_000,
      env: { ...process.env, ANTHROPIC_API_KEY: '' },
    });
    return parseAuthStatus(stdout);
  } catch (err) {
    return { loggedIn: false, detail: (err as Error).message };
  }
}

async function* runChat(req: ChatRequest): AsyncIterable<AgentEvent> {
  const prompt = messagesToPrompt(req.messages);
  const ac = new AbortController();
  if (req.signal) {
    if (req.signal.aborted) ac.abort();
    else
      req.signal.addEventListener('abort', () => ac.abort(), { once: true });
  }

  const handle = query({
    prompt,
    options: {
      model: req.model,
      permissionMode: 'bypassPermissions',
      cwd: process.cwd(),
      env: buildSubscriptionEnv(),
      includePartialMessages: true,
      abortController: ac,
    },
  });

  let sessionId: string | undefined;
  const billing: 'subscription' | 'api' = process.env.ANTHROPIC_API_KEY
    ? 'api'
    : 'subscription';

  try {
    for await (const msg of handle) {
      const m = msg as Record<string, unknown> & { type: string };
      if (m.type === 'system' && (m as { subtype?: string }).subtype === 'init') {
        sessionId = (m as { session_id?: string }).session_id;
        continue;
      }
      if (m.type === 'assistant') {
        const content =
          (m as { message?: { content?: Array<Record<string, unknown>> } }).message
            ?.content ?? [];
        for (const block of content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            yield { type: 'text-delta', text: block.text };
          } else if (block.type === 'tool_use') {
            yield {
              type: 'tool-call',
              id: String(block.id ?? ''),
              name: String(block.name ?? ''),
              args: block.input,
            };
          }
        }
        continue;
      }
      if (m.type === 'user') {
        const content =
          (m as { message?: { content?: Array<Record<string, unknown>> } }).message
            ?.content ?? [];
        for (const block of content) {
          if (block.type === 'tool_result') {
            yield {
              type: 'tool-result',
              id: String(block.tool_use_id ?? ''),
              ok: !block.is_error,
              result: block.content,
            };
          }
        }
        continue;
      }
      if (m.type === 'result') {
        const usage = (m as { usage?: Record<string, number> }).usage;
        const costUsd = (m as { total_cost_usd?: number }).total_cost_usd;
        yield {
          type: 'done',
          sessionId,
          billing,
          ...(usage && {
            usage: {
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
            },
          }),
          ...(typeof costUsd === 'number' && { costUsd }),
        };
        return;
      }
    }
    yield { type: 'done', sessionId, billing };
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
  } finally {
    handle.close?.();
  }
}

export function claudeCliProvider(): Provider {
  return {
    id: 'anthropic-claude-cli',
    displayName: 'Claude (subscription via local CLI)',
    authMode: 'cli-passthrough',
    status: detectStatus,
    chat: runChat,
  };
}
