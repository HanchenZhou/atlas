import { useEffect, useReducer } from 'react';
import type {
  PlanTask,
  ProviderInfo,
  Session,
  SessionSummary,
  TaskRecord,
} from '../client/daemon';

export type ThemePref = 'light' | 'dark' | 'system';

export type TaskState = {
  id: string;
  title: string;
  hint?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  result: string;
};

export type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  plan?: { tasks: TaskState[] };
};

export type AtlasState = {
  theme: ThemePref;
  providers: ProviderInfo[];
  activeProviderId: string | null;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  messages: ChatTurn[];
  streaming: boolean;
  showSettings: boolean;
  daemonReachable: boolean;
};

type Action =
  | { type: 'theme/set'; theme: ThemePref }
  | { type: 'providers/set'; providers: ProviderInfo[] }
  | { type: 'provider/activate'; id: string }
  | { type: 'sessions/set'; sessions: SessionSummary[] }
  | { type: 'session/set-current'; id: string | null }
  | { type: 'session/load'; session: Session }
  | { type: 'settings/toggle'; show?: boolean }
  | { type: 'message/append-user'; content: string }
  | { type: 'message/start-assistant'; id: string }
  | { type: 'message/append-delta'; id: string; text: string }
  | { type: 'message/finish-assistant'; id: string }
  | { type: 'message/attach-plan'; id: string; tasks: PlanTask[] }
  | {
      type: 'message/task-status';
      id: string;
      taskId: string;
      status: TaskState['status'];
    }
  | { type: 'message/task-delta'; id: string; taskId: string; text: string }
  | { type: 'session/new' }
  | { type: 'daemon/reachable'; reachable: boolean };

function recordToState(r: TaskRecord): TaskState {
  const out: TaskState = {
    id: r.id,
    title: r.title,
    status: r.status,
    result: r.result,
  };
  if (r.hint) out.hint = r.hint;
  return out;
}

function planTaskToState(t: PlanTask): TaskState {
  const out: TaskState = {
    id: t.id,
    title: t.title,
    status: 'pending',
    result: '',
  };
  if (t.hint) out.hint = t.hint;
  return out;
}

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
    case 'sessions/set':
      return { ...state, sessions: action.sessions };
    case 'session/set-current':
      return { ...state, currentSessionId: action.id };
    case 'session/load':
      return {
        ...state,
        currentSessionId: action.session.id,
        activeProviderId: action.session.providerId,
        messages: action.session.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => {
            const turn: ChatTurn = {
              id: crypto.randomUUID(),
              role: m.role as 'user' | 'assistant',
              content: m.content,
            };
            if (m.plan) {
              turn.plan = { tasks: m.plan.tasks.map(recordToState) };
            }
            return turn;
          }),
        streaming: false,
      };
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
    case 'message/attach-plan':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? { ...m, plan: { tasks: action.tasks.map(planTaskToState) } }
            : m,
        ),
      };
    case 'message/task-status':
      return {
        ...state,
        messages: state.messages.map((m) => {
          if (m.id !== action.id || !m.plan) return m;
          return {
            ...m,
            plan: {
              tasks: m.plan.tasks.map((t) =>
                t.id === action.taskId ? { ...t, status: action.status } : t,
              ),
            },
          };
        }),
      };
    case 'message/task-delta':
      return {
        ...state,
        messages: state.messages.map((m) => {
          if (m.id !== action.id || !m.plan) return m;
          return {
            ...m,
            plan: {
              tasks: m.plan.tasks.map((t) =>
                t.id === action.taskId
                  ? { ...t, result: t.result + action.text }
                  : t,
              ),
            },
          };
        }),
      };
    case 'session/new':
      return {
        ...state,
        currentSessionId: null,
        messages: [],
        streaming: false,
      };
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
    sessions: [],
    currentSessionId: null,
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
