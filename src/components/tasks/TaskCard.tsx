'use client';

import type { Project, Task } from '@/types';
import { cn } from '@/lib/cn';
import { describeDeadline } from '@/lib/jalali';
import { formatCount } from '@/lib/format';
import { priorityLabel, priorityTone } from '@/data/reference';
import { projectById, subtaskProgress, usersByIds } from '@/store/selectors';
import { AvatarStack, Badge, ProgressBar } from '@/components/ui';
import { TaskMetaBadges } from './TaskMetaBadges';
import { CalendarIcon, FlagIcon, PaperclipIcon, StarFilledIcon, SubtaskIcon } from '@/components/icons';

export interface TaskCardProps {
  readonly task: Task;
  readonly projects: readonly Project[];
  readonly onOpen: (taskId: string) => void;
  readonly selected?: boolean;
  /** Set while this card is the keyboard "picked up" item in the board. */
  readonly grabbed?: boolean;
  readonly dragHandlers?: {
    readonly onDragStart: (event: React.DragEvent<HTMLElement>) => void;
    readonly onDragEnd: () => void;
  };
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
}

/**
 * Board card. Shows priority, Jalali deadline, assignee stack, checklist progress and the
 * attachment count — the five signals a project manager scans a column for.
 */
export function TaskCard({ task, projects, onOpen, selected = false, grabbed = false, dragHandlers, onKeyDown }: TaskCardProps) {
  const progress = subtaskProgress(task);
  const deadline = describeDeadline(task.dueDate, new Date(), task.status === 'done');
  const assignees = usersByIds(task.assigneeIds);
  const project = projectById(projects, task.projectId);

  return (
    <article
      draggable={dragHandlers !== undefined}
      onDragStart={dragHandlers?.onDragStart}
      onDragEnd={dragHandlers?.onDragEnd}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="button"
      aria-roledescription="کارت وظیفه"
      aria-grabbed={grabbed || undefined}
      aria-label={`${task.title} — ${deadline.text}`}
      onClick={() => onOpen(task.id)}
      onKeyUp={(event) => {
        if (event.key === 'Enter') onOpen(task.id);
      }}
      className={cn(
        'group/card flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-surface p-3 text-start shadow-xs transition-all',
        'hover:border-brand hover:shadow-md',
        selected ? 'border-brand ring-1 ring-brand' : 'border-secondary',
        grabbed && 'rotate-1 scale-[1.02] border-brand shadow-lg',
      )}
    >
      <div className="flex items-start gap-2">
        <Badge tone={priorityTone(task.priority)} size="sm" iconStart={<FlagIcon size={11} />}>
          {priorityLabel(task.priority)}
        </Badge>
        {task.starred && <StarFilledIcon size={14} className="text-status-progress" label="ستاره‌دار" />}
        <span className="numeric ms-auto text-micro font-medium text-fg-quaternary latin-inline">
          {task.code}
        </span>
      </div>

      <h4 className="line-clamp-2 text-body-sm font-semibold leading-6 text-fg-primary">{task.title}</h4>

      {project && (
        <span className="truncate text-micro text-fg-tertiary">{project.name}</span>
      )}

      {progress.total > 0 && (
        <ProgressBar
          value={progress.done}
          max={progress.total}
          label={`پیشرفت زیروظیفه‌های ${task.title}`}
          tone={progress.done === progress.total ? 'done' : 'brand'}
        />
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2">
          <Badge tone={deadline.tone} size="sm" numeric iconStart={<CalendarIcon size={11} />}>
            {deadline.text}
          </Badge>
          {task.attachments.length > 0 && (
            <span className="numeric inline-flex items-center gap-0.5 text-micro text-fg-tertiary">
              <PaperclipIcon size={13} />
              {formatCount(task.attachments.length)}
            </span>
          )}
          {progress.total > 0 && (
            <span className="inline-flex items-center gap-0.5 text-micro text-fg-tertiary">
              <SubtaskIcon size={13} />
            </span>
          )}
          <TaskMetaBadges task={task} compact />
        </div>
        {assignees.length > 0 && <AvatarStack members={assignees} max={3} size="xs" />}
      </div>
    </article>
  );
}
