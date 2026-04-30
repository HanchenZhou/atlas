import type { ProviderInfo } from '../client/daemon';
import { GearIcon, PlusIcon } from './icons';

type Props = {
  providers: ProviderInfo[];
  activeProviderId: string | null;
  onNewChat(): void;
  onOpenSettings(): void;
  onCycleProvider(): void;
};

export function Sidebar({
  providers,
  activeProviderId,
  onNewChat,
  onOpenSettings,
  onCycleProvider,
}: Props) {
  const active = providers.find((p) => p.id === activeProviderId);
  return (
    <aside className="sidebar">
      <button className="new" onClick={onNewChat} type="button">
        <PlusIcon />
        New chat
      </button>

      <div className="group-label">Conversations</div>
      <div className="convo-list">
        <div className="empty-hint">
          No saved chats yet — history will appear here once persistence lands.
        </div>
      </div>

      <div className="sidebar-foot">
        <button className="pill" type="button" onClick={onCycleProvider}>
          <span
            className={`dot ${active?.status.loggedIn ? 'on' : 'off'}`}
            aria-hidden="true"
          />
          <span>{active?.displayName ?? 'No provider'}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 11 }}>
            ▾
          </span>
        </button>
        <button className="pill" type="button" onClick={onOpenSettings}>
          <GearIcon />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
