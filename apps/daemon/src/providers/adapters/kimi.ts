import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { runNativeLoop } from '../../agent/loop';
import type {
  AgentEvent,
  ChatRequest,
  Provider,
  ProviderStatus,
} from '../types';
import type { CredentialStore } from '../credentials';

const PROVIDER_KEY = 'kimi';
const BASE_URL = 'https://api.kimi.com/coding/v1';
const DEFAULT_MODEL = 'kimi-for-coding';

const loginSchema = z.object({
  apiKey: z.string().min(1, 'apiKey is required'),
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

export function kimiProvider(store: CredentialStore): Provider {
  const status = async (): Promise<ProviderStatus> => {
    const cred = await readCredential(store);
    if (!cred) return { loggedIn: false };
    return { loggedIn: true };
  };

  const chat = async function* (
    req: ChatRequest,
  ): AsyncIterable<AgentEvent> {
    const cred = await readCredential(store);
    if (!cred) {
      yield { type: 'error', message: 'kimi not logged in' };
      return;
    }
    const factory = createAnthropic({ apiKey: cred.apiKey, baseURL: BASE_URL });
    const model = factory(req.model ?? DEFAULT_MODEL);
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
    id: 'kimi',
    displayName: 'Kimi (Moonshot Coding Plan)',
    authMode: 'apiKey',
    status,
    chat,
    login,
    logout,
  };
}
