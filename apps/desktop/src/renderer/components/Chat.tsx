import { useEffect, useRef } from 'react';
import type { ChatTurn } from '../state/useAtlas';
import type { ProviderInfo } from '../client/daemon';

type Props = {
  messages: ChatTurn[];
  streaming: boolean;
  activeProvider: ProviderInfo | undefined;
};

export function Chat({ messages, streaming, activeProvider }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  return (
    <>
      <div className="chat-head">
        <div>
          <div className="title">
            {messages.length === 0 ? 'New conversation' : 'Conversation'}
          </div>
          <div className="sub">
            {activeProvider
              ? `${activeProvider.displayName} · ${activeProvider.authMode === 'cli-passthrough' ? 'subscription' : 'api key'}`
              : 'No provider selected'}
          </div>
        </div>
        <div className="spacer" />
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <h1>How can I help?</h1>
            <p>
              Ask anything. Switch providers from the bottom of the sidebar.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <div className="role">{m.role === 'user' ? 'You' : 'Atlas'}</div>
              <div className="content">
                {m.content}
                {streaming && i === messages.length - 1 && m.role === 'assistant' && (
                  <span className="caret" aria-hidden="true" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
