'use client';

import { useCallback, useRef, useState } from 'react';
import type { BoardColumn, Project, SemanticTone, Task, TaskStatus } from '@/types';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { tasksByColumn } from '@/store/selectors';
import { Badge, EmptyState, IconButton, Tooltip } from '@/components/ui';
import { TaskCard } from './TaskCard';
import { AddIcon, TaskSquareIcon, TrashIcon } from '@/components/icons';
import { AddColumnModal } from './AddColumnModal';

export interface KanbanBoardProps {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly columns: readonly BoardColumn[];
  readonly onOpenTask: (taskId: string) => void;
  /** Moves a card into a column; the column decides its canonical status. */
  readonly onMoveTask: (taskId: string, columnId: string) => void;
  readonly onCreateTask: (status: TaskStatus) => void;
  readonly onAddColumn: (title: string, tone: SemanticTone, mapsTo: TaskStatus) => void;
  readonly onRemoveColumn: (columnId: string) => void;
  readonly selectedTaskId: string | null;
  readonly onAnnounce: (message: string) => void;
}

const COLUMN_TONE: Readonly<Record<SemanticTone, string>> = {
  todo: 'bg-status-todo',
  progress: 'bg-status-progress',
  review: 'bg-status-review',
  done: 'bg-status-done',
  blocked: 'bg-status-blocked',
};

/**
 * Kanban board with two equivalent reordering paths:
 *
 *  - Pointer: native HTML5 drag and drop between columns.
 *  - Keyboard: focus a card, Space/Enter picks it up, ArrowLeft/ArrowRight (direction-aware
 *    in RTL) move it between columns, Space drops it and Escape cancels. Every transition is
 *    announced through the shell's live region, so the operation is fully non-visual.
 */
export function KanbanBoard({
  tasks,
  projects,
  columns,
  onOpenTask,
  onMoveTask,
  onCreateTask,
  onAddColumn,
  onRemoveColumn,
  selectedTaskId,
  onAnnounce,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const columnIds = columns.map((column) => column.id);

  const commitMove = useCallback(
    (taskId: string, columnId: string, viaKeyboard: boolean) => {
      onMoveTask(taskId, columnId);
      const task = tasks.find((entry) => entry.id === taskId);
      const column = columns.find((entry) => entry.id === columnId);
      if (task && column) {
        onAnnounce(`وظیفه «${task.title}» به ستون ${column.title} منتقل شد.`);
      }
      if (viaKeyboard) {
        // Focus follows the card across the DOM move.
        requestAnimationFrame(() => cardRefs.current.get(taskId)?.focus());
      }
    },
    [onMoveTask, onAnnounce, tasks, columns],
  );

  const handleCardKeyDown = useCallback(
    (task: Task) => (event: React.KeyboardEvent<HTMLElement>) => {
      const columnIndex = columns.findIndex((entry) =>
        columnIds.includes(task.columnId) ? entry.id === task.columnId : entry.id === task.status,
      );

      if (event.key === ' ') {
        event.preventDefault();
        if (grabbedId === task.id) {
          setGrabbedId(null);
          const current = columns[columnIndex];
          onAnnounce(`وظیفه «${task.title}» در ستون ${current?.title ?? ''} رها شد.`);
        } else {
          setGrabbedId(task.id);
          onAnnounce(
            `وظیفه «${task.title}» برداشته شد. با کلیدهای جهت‌نما جابه‌جا کنید و با فاصله رها کنید.`,
          );
        }
        return;
      }

      if (event.key === 'Escape' && grabbedId === task.id) {
        event.preventDefault();
        setGrabbedId(null);
        onAnnounce('جابه‌جایی لغو شد.');
        return;
      }

      if (grabbedId !== task.id) return;

      // RTL board: ArrowLeft advances to the next column, ArrowRight goes back.
      const delta = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
      if (delta === 0) return;

      event.preventDefault();
      const nextIndex = columnIndex + delta;
      const nextColumn = columns[nextIndex];
      if (!nextColumn) {
        onAnnounce('انتهای بورد است.');
        return;
      }
      commitMove(task.id, nextColumn.id, true);
    },
    [grabbedId, commitMove, onAnnounce, columns, columnIds],
  );

  return (
    <div
      className="scrollbar-thin flex h-full min-h-0 gap-4 overflow-x-auto p-4"
      role="application"
      aria-label="بورد کانبان وظایف"
    >
      {columns.map((column) => {
        const columnTasks = tasksByColumn(tasks, column.id, columnIds);
        const isDropTarget = dropTarget === column.id;

        return (
          <section
            key={column.id}
            aria-label={`ستون ${column.title}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDropTarget(column.id);
            }}
            onDragLeave={() => setDropTarget((current) => (current === column.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData('text/plain');
              setDropTarget(null);
              setDraggingId(null);
              if (taskId) commitMove(taskId, column.id, false);
            }}
            className={cn(
              // Columns share the row and only overflow once they hit their minimum, so a
              // 1440px viewport shows all four without a horizontal scrollbar.
              'flex min-w-[15rem] flex-1 flex-col rounded-2xl border bg-sunken/60 transition-colors',
              isDropTarget ? 'border-brand bg-brand-subtle/50' : 'border-secondary',
            )}
          >
            <header className="flex items-center gap-2 px-3 py-3">
              <span className={cn('size-2 shrink-0 rounded-full', COLUMN_TONE[column.tone])} aria-hidden="true" />
              <h3 className="min-w-0 truncate text-title-sm font-semibold text-fg-primary">{column.title}</h3>
              <Badge tone="neutral" size="sm" numeric>
                {formatCount(columnTasks.length)}
              </Badge>
              <span className="ms-auto flex items-center">
                {column.custom && (
                  <Tooltip content={`حذف ستون ${column.title}`}>
                    <IconButton
                      label={`حذف ستون ${column.title}`}
                      icon={<TrashIcon size={15} />}
                      size="xs"
                      onClick={() => onRemoveColumn(column.id)}
                      className="hover:text-status-blocked"
                    />
                  </Tooltip>
                )}
                <Tooltip content={`افزودن وظیفه به ${column.title}`}>
                  <IconButton
                    label={`افزودن وظیفه به ${column.title}`}
                    icon={<AddIcon size={16} />}
                    size="xs"
                    onClick={() => onCreateTask(column.mapsTo)}
                  />
                </Tooltip>
              </span>
            </header>

            <div className="scrollbar-thin flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
              {columnTasks.length === 0 ? (
                <EmptyState
                  compact
                  icon={<TaskSquareIcon size={18} />}
                  title="ستون خالی است"
                  description="کارتی را به اینجا بکشید یا وظیفه جدیدی بسازید."
                />
              ) : (
                columnTasks.map((task) => (
                  <div
                    key={task.id}
                    ref={(node) => {
                      const element = node?.firstElementChild;
                      if (element instanceof HTMLElement) {
                        cardRefs.current.set(task.id, element);
                      } else {
                        cardRefs.current.delete(task.id);
                      }
                    }}
                    className={cn('transition-opacity', draggingId === task.id && 'opacity-40')}
                  >
                    <TaskCard
                      task={task}
                      projects={projects}
                      onOpen={onOpenTask}
                      selected={selectedTaskId === task.id}
                      grabbed={grabbedId === task.id}
                      onKeyDown={handleCardKeyDown(task)}
                      dragHandlers={{
                        onDragStart: (event) => {
                          event.dataTransfer.setData('text/plain', task.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingId(task.id);
                        },
                        onDragEnd: () => {
                          setDraggingId(null);
                          setDropTarget(null);
                        },
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}

      {/* Trailing affordance, matching the column rhythm rather than floating over it. */}
      <div className="flex w-56 shrink-0 flex-col">
        <button
          type="button"
          onClick={() => setAddColumnOpen(true)}
          className={cn(
            'flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary',
            'text-fg-tertiary transition-colors hover:border-brand hover:bg-brand-subtle hover:text-fg-brand',
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-sunken">
            <AddIcon size={20} />
          </span>
          <span className="text-body-sm font-semibold">ستون جدید</span>
          <span className="px-4 text-center text-micro leading-5 text-fg-quaternary">
            یک مرحله تازه به گردش کار این بورد اضافه کنید
          </span>
        </button>
      </div>

      <AddColumnModal
        open={addColumnOpen}
        onClose={() => setAddColumnOpen(false)}
        onCreate={onAddColumn}
      />
    </div>
  );
}
