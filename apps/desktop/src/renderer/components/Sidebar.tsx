import type { ProviderInfo, SessionSummary } from '../client/daemon';
import { GearIcon, PlusIcon, TrashIcon } from './icons';

type Props = {
  providers: ProviderInfo[];
  activeProviderId: string | null;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onNewChat(): void;
  onSelectSession(id: string): void;
  onDeleteSession(id: string): void;
  onOpenSettings(): void;
  onCycleProvider(): void;
};

export function Sidebar({
  providers,
  activeProviderId,
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenSettings,
  onCycleProvider,
}: Props) {
  const active = providers.find((p) => p.id === activeProviderId);
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">A</div>
        <div className="name">Atlas</div>
      </div>

      <button className="new" onClick={onNewChat} type="button">
        <PlusIcon />
        <span className="label">New chat</span>
        <span className="k">⌘N</span>
      </button>

      <div className="group-label">Conversations</div>
      <div className="convo-list">
        {sessions.length === 0 ? (
          <div className="empty-hint">No conversations yet.</div>
        ) : (
          sessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              active={s.id === currentSessionId}
              onSelect={() => onSelectSession(s.id)}
              onDelete={() => onDeleteSession(s.id)}
            />
          ))
        )}
      </div>

      <div className="sidebar-foot">
        <button className="pill" type="button" onClick={onCycleProvider}>
          <span
            className={`dot ${active?.status.loggedIn ? 'on' : 'off'}`}
            aria-hidden="true"
          />
          <span style={{ flex: 1 }}>{active?.displayName ?? 'No provider'}</span>
          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>▾</span>
        </button>
        <button className="pill" type="button" onClick={onOpenSettings}>
          <GearIcon />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: SessionSummary;
  active: boolean;
  onSelect(): void;
  onDelete(): void;
}) {
  const label = session.title.trim() || 'Untitled chat';
  return (
    <div className={`convo-item${active ? ' active' : ''}`}>
      <button
        type="button"
        className="convo-label"
        onClick={onSelect}
        title={label}
      >
        {label}
      </button>
      <button
        type="button"
        className="convo-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete chat"
        title="Delete chat"
      >
        <TrashIcon />
      </button>
    </div>
  );
}
