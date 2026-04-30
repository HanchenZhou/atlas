import { useEffect } from 'react';
import type { ProviderInfo } from '../client/daemon';
import type { ThemePref } from '../state/useAtlas';
import { ProviderCard } from './ProviderCard';
import { CloseIcon } from './icons';

type Props = {
  open: boolean;
  providers: ProviderInfo[];
  theme: ThemePref;
  onClose(): void;
  onLogin(providerId: string, payload: unknown): Promise<void>;
  onLogout(providerId: string): Promise<void>;
  onRefresh(): Promise<void>;
  onThemeChange(theme: ThemePref): void;
};

export function SettingsSheet({
  open,
  providers,
  theme,
  onClose,
  onLogin,
  onLogout,
  onRefresh,
  onThemeChange,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`scrim ${open ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`sheet ${open ? 'show' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="sheet-head">
          <h2>Settings</h2>
          <span className="spacer" />
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="sheet-body">
          <h3
            style={{
              margin: '4px 0 12px',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-faint)',
            }}
          >
            Providers
          </h3>
          {providers.length === 0 ? (
            <p className="kv">
              Daemon unreachable. Run <code>bun --cwd apps/daemon dev</code> and
              reopen Settings.
            </p>
          ) : (
            providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                onLogin={(payload) => onLogin(p.id, payload)}
                onLogout={() => onLogout(p.id)}
                onRefresh={onRefresh}
              />
            ))
          )}

          <h3
            style={{
              margin: '20px 0 12px',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-faint)',
            }}
          >
            Appearance
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <button
                key={t}
                className={`btn ${theme === t ? 'primary' : ''}`}
                type="button"
                onClick={() => onThemeChange(t)}
              >
                {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>

          <p
            className="kv"
            style={{ marginTop: 24, lineHeight: 1.6 }}
          >
            Credentials are stored locally at{' '}
            <code>~/.atlas/credentials.json</code> with file mode 0600.
          </p>
        </div>
      </div>
    </>
  );
}
