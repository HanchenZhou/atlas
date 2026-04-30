import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { runNativeLoop } from '../../agent/loop';
import type {
  AgentEvent,
  ChatRequest,
  Provider,
  ProviderStatus,
} from '../types';
import type { CredentialStore } from '../credentials';

const PROVIDER_KEY = 'openai';

const loginSchema = z.object({
  apiKey: z.string().min(1, 'apiKey is required'),
  baseUrl: z.string().url().optional(),
});

type StoredCredential = z.infer<typeof loginSchema>;

async function readCredential(
  store: CredentialStore,
): Promise<StoredCredential | undefined> {
  const raw = await store.get(PROVIDER_KEY);
  if (!raw || typeof raw !== 'object') return undefined;
  const parsed = loginSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function openaiProvider(store: CredentialStore): Provider {
  const status = async (): Promise<ProviderStatus> => {
    const cred = await readCredential(store);
    if (!cred) return { loggedIn: false };
    return {
      loggedIn: true,
      ...(cred.baseUrl ? { detail: `baseUrl: ${cred.baseUrl}` } : {}),
    };
  };

  const chat = async function* (
    req: ChatRequest,
  ): AsyncIterable<AgentEvent> {
    const cred = await readCredential(store);
    if (!cred) {
      yield { type: 'error', message: 'openai not logged in' };
      return;
    }
    const factory = createOpenAI({
      apiKey: cred.apiKey,
      ...(cred.baseUrl && { baseURL: cred.baseUrl }),
    });
    const model = factory(req.model ?? 'gpt-4o-mini');
    yield* runNativeLoop({
      model,
      messages: req.messages,
      ...(req.signal && { signal: req.signal }),
    });
  };

  const login = async (input: unknown): Promise<void> => {
    const parsed = loginSchema.parse(input);
    await store.set(PROVIDER_KEY, parsed);
  };

  const logout = async (): Promise<void> => {
    await store.delete(PROVIDER_KEY);
  };

  return {
    id: 'openai',
    displayName: 'OpenAI',
    authMode: 'apiKey',
    status,
    chat,
    login,
    logout,
  };
}
