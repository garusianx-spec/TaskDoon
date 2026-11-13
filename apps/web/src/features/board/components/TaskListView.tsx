'use client';

import { useMemo, useState } from 'react';
import type { BoardColumn, Task, TaskStatus } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { Badge } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { CheckCircleIcon, ChevronDownIcon, TaskSquareIcon } from '@/components/icons';
import { TaskRow } from '@/features/board/components/TaskRow';
import { SortableHeader } from '@/features/board/components/SortableHeader';

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
export function TaskListView({
  tasks,
  columns,
  onOpenTask,
  onToggleComplete,
  selectedTaskId,
}: TaskListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [ascending, setAscending] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);

  const sorted = useMemo(() => {
    const direction = ascending ? 1 : -1;
    return tasks.slice().sort((a, b) => {
      switch (sortKey) {
        case 'due':
          if (a.dueDate === null || b.dueDate === null)
            return Number(a.dueDate === null) - Number(b.dueDate === null);
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
    <div className="h-full overflow-auto p-4 scrollbar-thin">
      <div className="min-w-[56rem] overflow-hidden rounded-xl border border-secondary bg-surface shadow-xs">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{`فهرست وظایف — ${formatCount(tasks.length)} مورد`}</caption>
          <thead className="bg-sunken">
            <tr>
              <SortableHeader
                label="عنوان وظیفه"
                active={sortKey === 'title'}
                ascending={ascending}
                sort={sortState('title')}
                onClick={() => toggleSort('title')}
                className="w-[34%]"
              />
              <SortableHeader
                label="وضعیت"
                active={sortKey === 'status'}
                ascending={ascending}
                sort={sortState('status')}
                onClick={() => toggleSort('status')}
              />
              <SortableHeader
                label="اولویت"
                active={sortKey === 'priority'}
                ascending={ascending}
                sort={sortState('priority')}
                onClick={() => toggleSort('priority')}
              />
              <SortableHeader
                label="مهلت انجام"
                active={sortKey === 'due'}
                ascending={ascending}
                sort={sortState('due')}
                onClick={() => toggleSort('due')}
              />
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

      <p className="mt-3 px-1 text-caption text-fg-tertiary numeric">
        {`مجموع ${formatCount(tasks.length)} وظیفه — ${formatCount(
          tasks.filter((task) => task.status === 'done').length,
        )} مورد انجام‌شده`}
      </p>
    </div>
  );
}
