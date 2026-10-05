'use client';

import { useMemo, useState } from 'react';
import type { Project, Task, TaskStatus } from '@/types';
import { cn } from '@/lib/cn';
import { describeDeadline, formatJalali } from '@/lib/jalali';
import { formatCount, formatFraction } from '@/lib/format';
import { priorityLabel, priorityTone, statusLabel, statusTone } from '@/data/reference';
import { projectById, subtaskProgress, usersByIds } from '@/store/selectors';
import { AvatarStack, Badge, EmptyState } from '@/components/ui';
import { TaskMetaBadges } from './TaskMetaBadges';
import { ChevronDownIcon, FlagIcon, StarFilledIcon, TaskSquareIcon } from '@/components/icons';

export interface TaskListViewProps {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly onOpenTask: (taskId: string) => void;
  readonly selectedTaskId: string | null;
}

type SortKey = 'due' | 'priority' | 'title' | 'status';

const PRIORITY_RANK: Readonly<Record<Task['priority'], number>> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_RANK: Readonly<Record<TaskStatus, number>> = {
  todo: 0,
  'in-progress': 1,
  review: 2,
  done: 3,
};

/**
 * Untitled UI data table. Column headers are sort buttons carrying `aria-sort`, and the row
 * itself is the activator so the whole line is one keyboard target.
 */
export function TaskListView({ tasks, projects, onOpenTask, selectedTaskId }: TaskListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [ascending, setAscending] = useState(true);

  const sorted = useMemo(() => {
    const direction = ascending ? 1 : -1;
    return tasks.slice().sort((a, b) => {
      switch (sortKey) {
        case 'due':
          return direction * a.dueDate.localeCompare(b.dueDate);
        case 'priority':
          return direction * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
        case 'status':
          return direction * (STATUS_RANK[a.status] - STATUS_RANK[b.status]);
        case 'title':
          return direction * a.title.localeCompare(b.title, 'fa');
        default: {
          const exhaustive: never = sortKey;
          return exhaustive;
        }
      }
    });
  }, [tasks, sortKey, ascending]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setAscending((current) => !current);
      return;
    }
    setSortKey(key);
    setAscending(true);
  };

  const sortState = (key: SortKey): 'ascending' | 'descending' | 'none' =>
    sortKey === key ? (ascending ? 'ascending' : 'descending') : 'none';

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<TaskSquareIcon size={26} />}
        title="وظیفه‌ای مطابق فیلترها یافت نشد"
        description="فیلتر پروژه یا نمای هوشمند را تغییر دهید تا وظایف بیشتری نمایش داده شود."
      />
    );
  }

  return (
    <div className="scrollbar-thin h-full overflow-auto p-4">
      <div className="min-w-[56rem] overflow-hidden rounded-xl border border-secondary bg-surface shadow-xs">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">
            {`فهرست وظایف — ${formatCount(tasks.length)} مورد`}
          </caption>
          <thead className="bg-sunken">
            <tr>
              <SortableHeader label="عنوان وظیفه" active={sortKey === 'title'} ascending={ascending} sort={sortState('title')} onClick={() => toggleSort('title')} className="w-[34%]" />
              <SortableHeader label="وضعیت" active={sortKey === 'status'} ascending={ascending} sort={sortState('status')} onClick={() => toggleSort('status')} />
              <SortableHeader label="اولویت" active={sortKey === 'priority'} ascending={ascending} sort={sortState('priority')} onClick={() => toggleSort('priority')} />
              <SortableHeader label="مهلت انجام" active={sortKey === 'due'} ascending={ascending} sort={sortState('due')} onClick={() => toggleSort('due')} />
              <th scope="col" className="px-4 py-3 text-start text-title-sm font-semibold text-fg-secondary">
                پیشرفت
              </th>
              <th scope="col" className="px-4 py-3 text-start text-title-sm font-semibold text-fg-secondary">
                مسئولان
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => {
              const progress = subtaskProgress(task);
              const deadline = describeDeadline(task.dueDate, new Date(), task.status === 'done');
              const project = projectById(projects, task.projectId);
              const assignees = usersByIds(task.assigneeIds);

              return (
                <tr
                  key={task.id}
                  tabIndex={0}
                  onClick={() => onOpenTask(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenTask(task.id);
                    }
                  }}
                  className={cn(
                    'cursor-pointer border-t border-secondary transition-colors hover:bg-hover',
                    selectedTaskId === task.id && 'bg-brand-subtle',
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {task.starred && <StarFilledIcon size={14} className="mt-1 shrink-0 text-status-progress" label="ستاره‌دار" />}
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-body-sm font-semibold text-fg-primary">{task.title}</span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="numeric truncate text-micro text-fg-tertiary">
                            {`${task.code}، ${project?.name ?? ''}`}
                          </span>
                          <TaskMetaBadges task={task} />
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(task.status)} size="md" dot>
                      {statusLabel(task.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={priorityTone(task.priority)} size="md" iconStart={<FlagIcon size={12} />}>
                      {priorityLabel(task.priority)}
                    </Badge>
                  </td>
                  <td className="numeric px-4 py-3">
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
                  <td className="numeric px-4 py-3 text-body-sm text-fg-secondary">
                    {progress.total > 0 ? formatFraction(progress.done, progress.total) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {assignees.length > 0 ? <AvatarStack members={assignees} max={3} size="sm" /> : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="numeric mt-3 px-1 text-caption text-fg-tertiary">
        {`مجموع ${formatCount(tasks.length)} وظیفه — ${formatCount(
          tasks.filter((task) => task.status === 'done').length,
        )} مورد انجام‌شده`}
      </p>
    </div>
  );
}

interface SortableHeaderProps {
  readonly label: string;
  readonly active: boolean;
  readonly ascending: boolean;
  readonly sort: 'ascending' | 'descending' | 'none';
  readonly onClick: () => void;
  readonly className?: string;
}

function SortableHeader({ label, active, ascending, sort, onClick, className }: SortableHeaderProps) {
  return (
    <th scope="col" aria-sort={sort} className={cn('px-4 py-3 text-start', className)}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-title-sm font-semibold text-fg-secondary transition-colors hover:text-fg-primary"
      >
        {label}
        <ChevronDownIcon
          size={14}
          className={cn(
            'transition-transform',
            active ? 'text-fg-brand' : 'text-fg-quaternary',
            active && !ascending && 'rotate-180',
          )}
        />
      </button>
    </th>
  );
}
