import { useEffect, useReducer } from 'react';
import type { ProviderInfo } from '../client/daemon';

export type ThemePref = 'light' | 'dark' | 'system';

export type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type AtlasState = {
  theme: ThemePref;
  providers: ProviderInfo[];
  activeProviderId: string | null;
  messages: ChatTurn[];
  streaming: boolean;
  showSettings: boolean;
  daemonReachable: boolean;
};

type Action =
  | { type: 'theme/set'; theme: ThemePref }
  | { type: 'providers/set'; providers: ProviderInfo[] }
  | { type: 'provider/activate'; id: string }
  | { type: 'settings/toggle'; show?: boolean }
  | { type: 'message/append-user'; content: string }
  | { type: 'message/start-assistant'; id: string }
  | { type: 'message/append-delta'; id: string; text: string }
  | { type: 'message/finish-assistant'; id: string }
  | { type: 'messages/clear' }
  | { type: 'daemon/reachable'; reachable: boolean };

function reducer(state: AtlasState, action: Action): AtlasState {
  switch (action.type) {
    case 'theme/set':
      return { ...state, theme: action.theme };
    case 'providers/set': {
      const next = action.providers;
      const stillExists = next.some((p) => p.id === state.activeProviderId);
      const fallback = next.find((p) => p.status.loggedIn)?.id ?? next[0]?.id ?? null;
      return {
        ...state,
        providers: next,
        activeProviderId: stillExists ? state.activeProviderId : fallback,
      };
    }
    case 'provider/activate':
      return { ...state, activeProviderId: action.id };
    case 'settings/toggle':
      return {
        ...state,
        showSettings: action.show ?? !state.showSettings,
      };
    case 'message/append-user':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: crypto.randomUUID(), role: 'user', content: action.content },
        ],
      };
    case 'message/start-assistant':
      return {
        ...state,
        streaming: true,
        messages: [
          ...state.messages,
          { id: action.id, role: 'assistant', content: '' },
        ],
      };
    case 'message/append-delta':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, content: m.content + action.text } : m,
        ),
      };
    case 'message/finish-assistant':
      return { ...state, streaming: false };
    case 'messages/clear':
      return { ...state, messages: [], streaming: false };
    case 'daemon/reachable':
      return { ...state, daemonReachable: action.reachable };
    default:
      return state;
  }
}

const THEME_KEY = 'atlas.theme';

function readStoredTheme(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // localStorage may be unavailable in some contexts; fall through.
  }
  return 'system';
}

function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function useAtlas() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    theme: readStoredTheme(),
    providers: [],
    activeProviderId: null,
    messages: [],
    streaming: false,
    showSettings: false,
    daemonReachable: true,
  }));

  // Apply theme attribute + persist whenever it changes.
  useEffect(() => {
    applyTheme(state.theme);
    try {
      localStorage.setItem(THEME_KEY, state.theme);
    } catch {
      // ignore storage failures
    }
  }, [state.theme]);

  return { state, dispatch };
}
