'use client';

import { useMemo } from 'react';
import type { Task } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { issueTypeOf, severityLabel, severityTone } from '@/lib/agile';
import { formatDuration } from '@/lib/duration';
import { formatCount } from '@/lib/format';
import { priorityLabel, priorityTone } from '@/data/reference';
import { projectById, usersByIds } from '@/store/selectors';
import { AvatarStack, Badge, Button, EmptyState } from '@/components/ui';
import { AddIcon, BacklogIcon, FlagIcon, KanbanIcon, TimerIcon } from '@/components/icons';
import { BlockedPill } from './BlockedPill';
import { IssueTypeIcon } from './IssueTypeIcon';

export interface BacklogViewProps {
  readonly tasks: readonly Task[];
  readonly selectedTaskId: string | null;
  readonly onOpenTask: (taskId: string) => void;
  readonly onMoveToBoard: (task: Task) => void;
  readonly onCreate: () => void;
}

const PRIORITY_RANK: Readonly<Record<Task['priority'], number>> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Work not planned onto the board yet: one scannable row per item, most urgent first, each with
 * «انتقال به بورد». The board itself never shows these.
 */
export function BacklogView({ tasks, selectedTaskId, onOpenTask, onMoveToBoard, onCreate }: BacklogViewProps) {
  const sorted = useMemo(
    () => tasks.slice().sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt.localeCompare(a.createdAt)),
    [tasks],
  );

  return (
    <section aria-label="بک‌لاگ" className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BacklogIcon size={18} className="text-fg-tertiary" />
        <h2 className="text-title-sm font-semibold text-fg-primary">بک‌لاگ</h2>
        <Badge tone="neutral" size="sm" numeric>
          {formatCount(tasks.length, 999)}
        </Badge>
        <span className="text-caption text-fg-tertiary">کارهایی که هنوز به بورد نیامده‌اند.</span>
        <Button size="sm" variant="secondary" className="ms-auto" iconStart={<AddIcon size={16} />} onClick={onCreate}>
          افزودن به بک‌لاگ
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<BacklogIcon size={26} />}
          title="بک‌لاگ خالی است"
          description="کارهایی را که هنوز برای بورد آماده نیستند اینجا نگه دارید و هر وقت آماده شدند با یک کلیک به بورد ببرید."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((task) => {
            const project = projectById(task.projectId);
            const assignees = usersByIds(task.assigneeIds);
            const type = issueTypeOf(task);
            return (
              <li
                key={task.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-surface px-3 py-2.5 shadow-xs transition-colors hover:border-brand',
                  selectedTaskId === task.id ? 'border-brand ring-1 ring-brand' : 'border-secondary',
                )}
              >
                <button type="button" onClick={() => onOpenTask(task.id)} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                  <IssueTypeIcon type={type} severity={task.severity ?? null} showTask size={16} />
                  <span className="numeric latin-inline shrink-0 text-micro font-medium text-fg-quaternary">{task.code}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm font-semibold text-fg-primary">{task.title}</span>
                    {project && <span className="truncate text-micro text-fg-tertiary">{project.name}</span>}
                  </span>
                </button>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={priorityTone(task.priority)} size="sm" iconStart={<FlagIcon size={11} />}>
                    {priorityLabel(task.priority)}
                  </Badge>
                  {type === 'bug' && task.severity && (
                    <Badge tone={severityTone(task.severity)} size="sm">
                      {`شدت ${severityLabel(task.severity)}`}
                    </Badge>
                  )}
                  {(task.blockedByIds?.length ?? 0) > 0 && <BlockedPill task={task} />}
                  {task.estimatedMinutes != null && (
                    <Badge tone="neutral" size="sm" numeric iconStart={<TimerIcon size={11} />}>
                      {formatDuration(task.estimatedMinutes)}
                    </Badge>
                  )}
                </span>
                {assignees.length > 0 && <AvatarStack members={assignees} max={3} size="xs" />}
                <Button size="xs" variant="secondary" iconStart={<KanbanIcon size={14} />} onClick={() => onMoveToBoard(task)} aria-label={`انتقال ${task.code} به بورد`}>
                  انتقال به بورد
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
