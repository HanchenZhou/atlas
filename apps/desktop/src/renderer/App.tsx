import { useCallback, useEffect, useMemo } from 'react';
import { DaemonClient, type ChatMessage } from './client/daemon';
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

  // Initial fetch + poll lightly so reconnect is automatic.
  useEffect(() => {
    refreshProviders();
    const t = setInterval(refreshProviders, 10_000);
    return () => clearInterval(t);
  }, [refreshProviders]);

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
    if (next) dispatch({ type: 'provider/activate', id: next.id });
  };

  const send = async (content: string) => {
    if (!activeProvider) return;
    dispatch({ type: 'message/append-user', content });
    const assistantId = crypto.randomUUID();
    dispatch({ type: 'message/start-assistant', id: assistantId });

    const history: ChatMessage[] = [
      ...state.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    try {
      for await (const event of client.chat({
        providerId: activeProvider.id,
        model: DEFAULT_MODEL[activeProvider.id],
        messages: history,
      })) {
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
    }
  };

  return (
    <div className="app">
      <div className="titlebar">Atlas</div>
      <div className="body">
        <Sidebar
          providers={state.providers}
          activeProviderId={state.activeProviderId}
          onNewChat={() => dispatch({ type: 'messages/clear' })}
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
      </div>

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
