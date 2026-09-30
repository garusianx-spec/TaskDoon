'use client';

import { useMemo, useState } from 'react';
import type { BoardColumn, Task, TaskStatus } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { describeDeadline, formatJalali } from '@taskin/jalali';
import { formatCount, formatFraction } from '@/lib/format';
import { priorityLabel, priorityTone, statusTone } from '@/data/reference';
import { columnForTask, projectById, subtaskProgress, usersByIds } from '@/store/selectors';
import { AvatarStack, Badge, EmptyState } from '@/components/ui';
import { CheckCircleIcon, ChevronDownIcon, FlagIcon, StarFilledIcon, TaskSquareIcon } from '@/components/icons';
import { TaskCompleteCheckbox, completedTitleClass } from './TaskCompleteCheckbox';

export interface TaskListViewProps {
  readonly tasks: readonly Task[];
  readonly columns: readonly BoardColumn[];
  readonly onOpenTask: (taskId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
  readonly selectedTaskId: string | null;
}

const COLUMN_COUNT = 6;

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
 * itself is the activator so the whole line is one keyboard target. Completed work collects
 * in its own collapsible row group under the open tasks, so ticking a checkbox visibly moves
 * the task into "انجام‌شده".
 */
export function TaskListView({ tasks, columns, onOpenTask, onToggleComplete, selectedTaskId }: TaskListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [ascending, setAscending] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);

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

  const openTasks = sorted.filter((task) => task.status !== 'done');
  const completedTasks = sorted.filter((task) => task.status === 'done');

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
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                columns={columns}
                selected={selectedTaskId === task.id}
                onOpen={onOpenTask}
                onToggleComplete={onToggleComplete}
              />
            ))}
            {openTasks.length === 0 && (
              <tr className="border-t border-secondary">
                <td colSpan={COLUMN_COUNT} className="px-4 py-6 text-center text-body-sm text-fg-tertiary">
                  همه وظایف این نما انجام شده‌اند.
                </td>
              </tr>
            )}
          </tbody>
          {completedTasks.length > 0 && (
            <tbody>
              <tr className="border-t border-secondary bg-sunken/60">
                <th scope="rowgroup" colSpan={COLUMN_COUNT} className="px-4 py-2 text-start">
                  <button
                    type="button"
                    aria-expanded={showCompleted}
                    onClick={() => setShowCompleted((value) => !value)}
                    className="inline-flex items-center gap-2 text-caption font-semibold text-fg-secondary transition-colors hover:text-fg-primary"
                  >
                    <ChevronDownIcon
                      size={14}
                      className={cn('transition-transform', !showCompleted && 'rotate-90 rtl:-rotate-90')}
                    />
                    <CheckCircleIcon size={16} className="text-status-done" />
                    انجام‌شده
                    <Badge tone="done" size="sm" numeric>
                      {formatCount(completedTasks.length)}
                    </Badge>
                  </button>
                </th>
              </tr>
              {showCompleted &&
                completedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    columns={columns}
                    selected={selectedTaskId === task.id}
                    onOpen={onOpenTask}
                    onToggleComplete={onToggleComplete}
                  />
                ))}
            </tbody>
          )}
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

interface TaskRowProps {
  readonly task: Task;
  readonly columns: readonly BoardColumn[];
  readonly selected: boolean;
  readonly onOpen: (taskId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
}

function TaskRow({ task, columns, selected, onOpen, onToggleComplete }: TaskRowProps) {
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
          {task.starred && <StarFilledIcon size={14} className="mt-1 shrink-0 text-status-progress" label="ستاره‌دار" />}
          <div className="flex min-w-0 flex-col">
            <span
              className={cn(
                'truncate text-body-sm font-semibold transition-[color,opacity]',
                done ? completedTitleClass : 'text-fg-primary',
              )}
            >
              {task.title}
            </span>
            <span className="numeric truncate text-micro text-fg-tertiary">
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
