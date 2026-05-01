import { useEffect, useRef } from 'react';
import type { ChatTurn } from '../state/useAtlas';
import type { ProviderInfo } from '../client/daemon';
import { Markdown } from './Markdown';
import { TaskChecklist } from './TaskChecklist';

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
        <span className="title">
          {messages.length === 0 ? 'New conversation' : 'Conversation'}
        </span>
        <span className="sub">
          {activeProvider
            ? `${activeProvider.displayName} · ${activeProvider.authMode === 'cli-passthrough' ? 'subscription' : 'api key'}`
            : 'No provider selected'}
        </span>
        <span className="spacer" />
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
          messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const showCaret =
              streaming && isLast && m.role === 'assistant' && !m.plan;
            return (
              <div key={m.id} className={`msg ${m.role}`}>
                <div className="role">{m.role === 'user' ? 'You' : 'Atlas'}</div>
                <div className="content">
                  {m.role === 'assistant' && m.plan ? (
                    <TaskChecklist
                      tasks={m.plan.tasks}
                      streaming={streaming && isLast}
                    />
                  ) : m.role === 'assistant' ? (
                    <Markdown>{m.content}</Markdown>
                  ) : (
                    m.content
                  )}
                  {showCaret && <span className="caret" aria-hidden="true" />}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
