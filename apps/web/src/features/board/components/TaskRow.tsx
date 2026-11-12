'use client';

import type { BoardColumn, Task } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { describeDeadline, formatJalali } from '@taskin/jalali';
import { formatFraction } from '@/lib/format';
import { priorityLabel, priorityTone, statusTone } from '@/data/reference';
import { columnForTask, projectById, subtaskProgress, usersByIds } from '@/store/selectors';
import { AvatarStack, Badge } from '@/components/ui';
import { FlagIcon, StarFilledIcon } from '@/components/icons';
import { TaskCompleteCheckbox, completedTitleClass } from '@/features/tasks/components/TaskCompleteCheckbox';

interface TaskRowProps {
  readonly task: Task;
  readonly columns: readonly BoardColumn[];
  readonly selected: boolean;
  readonly onOpen: (taskId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
}

export function TaskRow({ task, columns, selected, onOpen, onToggleComplete }: TaskRowProps) {
  const done = task.status === 'done';
  const progress = subtaskProgress(task);
  const deadline = describeDeadline(task.dueDate, new Date(), done);
  const project = projectById(task.projectId);
  const assignees = usersByIds(task.assigneeIds);
  const column = columnForTask(columns, task);

  return (
    <tr
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(task.id);
        }
      }}
      className={cn(
        'cursor-pointer border-t border-secondary transition-colors hover:bg-hover',
        selected && 'bg-brand-subtle',
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-start gap-2.5">
          <TaskCompleteCheckbox
            task={task}
            onToggle={(completed) => onToggleComplete(task.id, completed)}
            className="mt-0.5"
          />
          {task.starred && (
            <StarFilledIcon size={14} className="mt-1 shrink-0 text-status-progress" label="ستاره‌دار" />
          )}
          <div className="flex min-w-0 flex-col">
            <span
              className={cn(
                'truncate text-body-sm font-semibold transition-[color,opacity]',
                done ? completedTitleClass : 'text-fg-primary',
              )}
            >
              {task.title}
            </span>
            <span className="truncate text-micro text-fg-tertiary numeric">
              {`${task.code}، ${project?.name ?? ''}`}
            </span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge tone={statusTone(task.status)} size="md" dot>
          {column?.title ?? task.status}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge tone={priorityTone(task.priority)} size="md" iconStart={<FlagIcon size={12} />}>
          {priorityLabel(task.priority)}
        </Badge>
      </td>
      <td className="px-4 py-3 numeric">
        <div className="flex flex-col">
          <span className="text-body-sm text-fg-primary">{formatJalali(task.dueDate, 'medium')}</span>
          {/*
            `describeDeadline` falls back to the plain date for completed and
            far-off work, which would just repeat the line above. Only the
            urgent/near tones say something the absolute date does not.
          */}
          {(deadline.tone === 'blocked' || deadline.tone === 'progress') && (
            <span
              className={cn(
                'text-micro font-medium',
                deadline.tone === 'blocked' ? 'text-status-blocked' : 'text-status-progress',
              )}
            >
              {deadline.text}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-body-sm text-fg-secondary numeric">
        {progress.total > 0 ? formatFraction(progress.done, progress.total) : '—'}
      </td>
      <td className="px-4 py-3">
        {assignees.length > 0 ? <AvatarStack members={assignees} max={3} size="sm" /> : '—'}
      </td>
    </tr>
  );
}
