import { useState } from 'react';
import type { ProviderInfo } from '../client/daemon';

type Props = {
  provider: ProviderInfo;
  onLogin(payload: unknown): Promise<void>;
  onLogout(): Promise<void>;
  onRefresh(): Promise<void>;
};

export function ProviderCard({
  provider,
  onLogin,
  onLogout,
  onRefresh,
}: Props) {
  if (provider.authMode === 'cli-passthrough') {
    return <CliPassthroughCard provider={provider} onRefresh={onRefresh} />;
  }
  if (provider.authMode === 'apiKey') {
    return (
      <ApiKeyCard
        provider={provider}
        onLogin={onLogin}
        onLogout={onLogout}
      />
    );
  }
  return null;
}

function CliPassthroughCard({
  provider,
  onRefresh,
}: {
  provider: ProviderInfo;
  onRefresh(): Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const connected = provider.status.loggedIn;
  return (
    <div className="provider-card">
      <div className="provider-card-head">
        <span className={`dot ${connected ? 'on' : 'off'}`} aria-hidden="true" />
        <span className="name">{provider.displayName}</span>
        <span className={`badge ${connected ? 'on' : ''}`}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
        <span className="spacer" />
        <button
          className="btn ghost"
          type="button"
          onClick={async () => {
            setRefreshing(true);
            try {
              await onRefresh();
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? 'Checking…' : 'Recheck'}
        </button>
      </div>
      <div className="provider-card-body">
        Uses your local <code>claude</code> CLI subscription — no API key needed.
        {connected ? (
          provider.status.detail && (
            <div className="kv" style={{ marginTop: 6 }}>
              {provider.status.detail}
            </div>
          )
        ) : (
          <div className="kv" style={{ marginTop: 6 }}>
            Run <code>claude /login</code> in a terminal, then click Recheck.
          </div>
        )}
      </div>
    </div>
  );
}

function ApiKeyCard({
  provider,
  onLogin,
  onLogout,
}: {
  provider: ProviderInfo;
  onLogin(payload: unknown): Promise<void>;
  onLogout(): Promise<void>;
}) {
  const connected = provider.status.loggedIn;
  const [editing, setEditing] = useState(!connected);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setApiKey('');
    setBaseUrl('');
    setError(null);
  };

  const showBaseUrl = provider.id !== 'kimi';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: { apiKey: string; baseUrl?: string } = { apiKey };
      if (showBaseUrl && baseUrl.trim()) payload.baseUrl = baseUrl.trim();
      await onLogin(payload);
      reset();
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await onLogout();
      reset();
      setEditing(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="provider-card">
      <div className="provider-card-head">
        <span className={`dot ${connected ? 'on' : 'off'}`} aria-hidden="true" />
        <span className="name">{provider.displayName}</span>
        <span className={`badge ${connected ? 'on' : ''}`}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
        <span className="spacer" />
        {connected && !editing && (
          <button
            className="btn ghost"
            type="button"
            onClick={disconnect}
            disabled={busy}
          >
            Disconnect
          </button>
        )}
      </div>

      {editing ? (
        <div className="provider-card-body">
          {showBaseUrl
            ? 'Paste an API key. Optionally set a custom base URL for OpenAI-compatible providers (Qwen, GLM, DeepSeek, Ollama).'
            : 'Paste your Kimi coding plan API key — the endpoint is fixed.'}
          <div className="field">
            <label htmlFor={`${provider.id}-apikey`}>API key</label>
            <input
              id={`${provider.id}-apikey`}
              type="password"
              autoComplete="off"
              placeholder="sk-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          {showBaseUrl && (
            <div className="field">
              <label htmlFor={`${provider.id}-baseurl`}>
                Base URL <span className="hint">(optional)</span>
              </label>
              <input
                id={`${provider.id}-baseurl`}
                type="text"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          )}
          {error && <div className="field err">{error}</div>}
          <div className="row-actions">
            {connected && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  reset();
                  setEditing(false);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            )}
            <button
              className="btn primary"
              type="button"
              onClick={submit}
              disabled={busy || !apiKey.trim()}
            >
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      ) : (
        <div className="provider-card-body">
          {provider.status.detail ?? 'API key stored locally.'}
        </div>
      )}
    </div>
  );
}
