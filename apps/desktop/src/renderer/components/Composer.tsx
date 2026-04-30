import { useEffect, useRef, useState } from 'react';
import type { ProviderInfo } from '../client/daemon';

type Props = {
  activeProvider: ProviderInfo | undefined;
  disabled: boolean;
  streaming: boolean;
  onSend(content: string): void;
  onCycleProvider(): void;
};

export function Composer({
  activeProvider,
  disabled,
  streaming,
  onSend,
  onCycleProvider,
}: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to a reasonable cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  const placeholder = activeProvider?.status.loggedIn
    ? 'Ask anything…'
    : activeProvider
      ? `${activeProvider.displayName} is not connected — open Settings`
      : 'Daemon not reachable — start `bun --cwd apps/daemon dev`';

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled || streaming}
        />
        <div className="composer-row">
          <button className="model-pill" type="button" onClick={onCycleProvider}>
            <span
              className={`dot ${activeProvider?.status.loggedIn ? 'on' : 'off'}`}
              aria-hidden="true"
            />
            {activeProvider?.displayName ?? 'No provider'}
            <span style={{ opacity: 0.6 }}>▾</span>
          </button>
          <span className="kbd-hint">⌘ + ↵ to send</span>
          <button
            className="send"
            type="button"
            onClick={send}
            disabled={
              disabled || streaming || !value.trim() || !activeProvider?.status.loggedIn
            }
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
