import { useState } from 'react';
import type { TaskState } from '../state/useAtlas';
import { Markdown } from './Markdown';

type Props = {
  tasks: TaskState[];
  streaming: boolean;
};

export function TaskChecklist({ tasks, streaming }: Props) {
  return (
    <div className="task-checklist">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} streaming={streaming} />
      ))}
    </div>
  );
}

function TaskItem({ task, streaming }: { task: TaskState; streaming: boolean }) {
  const [open, setOpen] = useState(task.status === 'running');
  const showCaret =
    streaming && task.status === 'running' && task.result.length > 0;

  return (
    <div className={`task-item status-${task.status}`}>
      <button
        type="button"
        className="task-row"
        onClick={() => setOpen((v) => !v)}
        disabled={task.result.length === 0 && task.status !== 'running'}
      >
        <span className="task-status" aria-hidden="true">
          {statusGlyph(task.status)}
        </span>
        <span className="task-title">{task.title}</span>
        {task.result.length > 0 && (
          <span className="task-toggle" aria-hidden="true">
            {open ? '–' : '+'}
          </span>
        )}
      </button>
      {open && task.result.length > 0 && (
        <div className="task-result">
          <Markdown>{task.result}</Markdown>
          {showCaret && <span className="caret" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}

function statusGlyph(status: TaskState['status']): string {
  switch (status) {
    case 'pending':
      return '○';
    case 'running':
      return '◐';
    case 'done':
      return '●';
    case 'failed':
      return '✕';
  }
}
