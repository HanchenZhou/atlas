import { useCallback, useEffect, useMemo } from 'react';
import { DaemonClient } from './client/daemon';
import { useAtlas } from './state/useAtlas';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { Composer } from './components/Composer';
import { SettingsSheet } from './components/SettingsSheet';

const DEFAULT_MODEL: Record<string, string> = {
  'anthropic-claude-cli': 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
  kimi: 'kimi-for-coding',
};

const client = new DaemonClient();

export function App() {
  const { state, dispatch } = useAtlas();

  const refreshProviders = useCallback(async () => {
    try {
      const providers = await client.listProviders();
      dispatch({ type: 'providers/set', providers });
      dispatch({ type: 'daemon/reachable', reachable: true });
    } catch {
      dispatch({ type: 'daemon/reachable', reachable: false });
    }
  }, [dispatch]);

  const refreshSessions = useCallback(async () => {
    try {
      const sessions = await client.listSessions();
      dispatch({ type: 'sessions/set', sessions });
    } catch {
      // daemon polling already surfaces unreachability; swallow here.
    }
  }, [dispatch]);

  // Initial fetch + poll lightly so reconnect is automatic.
  useEffect(() => {
    refreshProviders();
    refreshSessions();
    const t = setInterval(refreshProviders, 10_000);
    return () => clearInterval(t);
  }, [refreshProviders, refreshSessions]);

  const activeProvider = useMemo(
    () => state.providers.find((p) => p.id === state.activeProviderId),
    [state.providers, state.activeProviderId],
  );

  const cycleProvider = () => {
    if (state.providers.length === 0) return;
    const idx = state.providers.findIndex(
      (p) => p.id === state.activeProviderId,
    );
    const next = state.providers[(idx + 1) % state.providers.length];
    if (!next) return;
    // A session is sticky to its provider on the daemon side, so switching
    // providers implicitly starts a new chat.
    if (state.currentSessionId) dispatch({ type: 'session/new' });
    dispatch({ type: 'provider/activate', id: next.id });
  };

  const selectSession = async (id: string) => {
    try {
      const session = await client.getSession(id);
      if (session) dispatch({ type: 'session/load', session });
    } catch {
      // ignore — user can retry.
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await client.deleteSession(id);
      if (state.currentSessionId === id) dispatch({ type: 'session/new' });
      await refreshSessions();
    } catch {
      // ignore — user can retry.
    }
  };

  const send = async (content: string) => {
    if (!activeProvider) return;
    dispatch({ type: 'message/append-user', content });
    const assistantId = crypto.randomUUID();
    dispatch({ type: 'message/start-assistant', id: assistantId });

    const wasNewSession = state.currentSessionId === null;

    try {
      const { sessionId, events } = await client.chat({
        sessionId: state.currentSessionId ?? undefined,
        providerId: activeProvider.id,
        model: DEFAULT_MODEL[activeProvider.id],
        message: { role: 'user', content },
      });

      if (wasNewSession) {
        dispatch({ type: 'session/set-current', id: sessionId });
      }

      for await (const event of events) {
        if (event.type === 'text-delta') {
          dispatch({
            type: 'message/append-delta',
            id: assistantId,
            text: event.text,
          });
        } else if (event.type === 'error') {
          dispatch({
            type: 'message/append-delta',
            id: assistantId,
            text: `\n\n[error] ${event.message}`,
          });
        }
      }
    } catch (err) {
      dispatch({
        type: 'message/append-delta',
        id: assistantId,
        text: `\n\n[error] ${(err as Error).message}`,
      });
    } finally {
      dispatch({ type: 'message/finish-assistant', id: assistantId });
      refreshSessions();
    }
  };

  return (
    <div className="app">
      <Sidebar
        providers={state.providers}
        activeProviderId={state.activeProviderId}
        sessions={state.sessions}
        currentSessionId={state.currentSessionId}
        onNewChat={() => dispatch({ type: 'session/new' })}
        onSelectSession={selectSession}
        onDeleteSession={deleteSession}
        onOpenSettings={() => dispatch({ type: 'settings/toggle', show: true })}
        onCycleProvider={cycleProvider}
      />
      <main className="chat">
        <Chat
          messages={state.messages}
          streaming={state.streaming}
          activeProvider={activeProvider}
        />
        <Composer
          activeProvider={activeProvider}
          disabled={!state.daemonReachable}
          streaming={state.streaming}
          onSend={send}
          onCycleProvider={cycleProvider}
        />
      </main>

      <SettingsSheet
        open={state.showSettings}
        providers={state.providers}
        theme={state.theme}
        onClose={() => dispatch({ type: 'settings/toggle', show: false })}
        onLogin={async (providerId, payload) => {
          await client.login(providerId, payload);
          await refreshProviders();
        }}
        onLogout={async (providerId) => {
          await client.logout(providerId);
          await refreshProviders();
        }}
        onRefresh={refreshProviders}
        onThemeChange={(theme) => dispatch({ type: 'theme/set', theme })}
      />

      {!state.daemonReachable && (
        <div className="connection-error">
          Can&rsquo;t reach the daemon at <code>localhost:3001</code>. Start it
          with <code>bun --cwd apps/daemon dev</code>.
        </div>
      )}
    </div>
  );
}
