export type ProviderId = 'anthropic-claude-cli';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatRequest = {
  providerId: ProviderId;
  model?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

export type AgentEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; args: unknown }
  | {
      type: 'tool-result';
      id: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }
  | {
      type: 'done';
      sessionId?: string;
      usage?: { inputTokens: number; outputTokens: number };
      costUsd?: number;
      billing?: 'subscription' | 'api';
    }
  | { type: 'error'; message: string };

export type ProviderStatus = {
  loggedIn: boolean;
  detail?: string;
};

export type AuthMode = 'cli-passthrough' | 'apiKey' | 'oauth';

export type Provider = {
  id: ProviderId;
  displayName: string;
  authMode: AuthMode;
  status(): Promise<ProviderStatus>;
  chat(req: ChatRequest): AsyncIterable<AgentEvent>;
};
