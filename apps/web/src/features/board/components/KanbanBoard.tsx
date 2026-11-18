'use client';

import { useKanbanBoard } from '@/features/board/hooks/useKanbanBoard';
import { cn } from '@/lib/utils';
import { TAG_STRIPE } from '@/lib/tag-tone';
import { tasksInColumn } from '@/store/selectors';
import { EmptyState } from '@/components/shared/EmptyState';
import { TaskCard } from '@/features/tasks/components/TaskCard';
import { TaskSquareIcon } from '@/components/icons';
import { Button } from '@/components/ui';
import { ColumnHeader } from '@/features/board/components/ColumnHeader';
import { DeleteColumnDialog } from '@/features/board/components/DeleteColumnDialog';
import { AddColumnCard } from '@/features/board/components/AddColumnCard';
import { type KanbanBoardProps } from '@/features/board/types/kanban';

/**
 * Kanban board with two equivalent reordering paths:
 *
 *  - Pointer: native HTML5 drag and drop between columns.
 *  - Keyboard: focus a card, Space picks it up, ArrowLeft/ArrowRight (direction-aware in
 *    RTL) move it between columns, Space drops it and Escape cancels. Every transition is
 *    announced through the shell's live region, so the operation is fully non-visual.
 *
 * Columns come from workspace state: the four built-ins plus any the team adds from the
 * dashed "افزودن ستون جدید" card at the board's far (inline-end) edge. Every column — built-in
 * or custom — can be renamed or deleted from its ⋯ menu; deleting one that still holds cards
 * asks whether to migrate them to another column or archive them.
 */
export function KanbanBoard({
  tasks,
  allTasks,
  columns,
  editable = true,
  filtered = false,
  onOpenTask,
  onMoveTask,
  onToggleComplete,
  onCreateTask,
  onAddColumn,
  onRenameColumn,
  onRemoveColumn,
  selectedTaskId,
  onAnnounce,
}: KanbanBoardProps) {
  const {
    draggingId,
    setDraggingId,
    dropTarget,
    setDropTarget,
    grabbedId,
    renamingId,
    setRenamingId,
    deleting,
    setDeleting,
    boardRef,
    cardRefs,
    hintId,
    revealBoardEnd,
    columnLoad,
    requestDelete,
    commitMove,
    handleCardKeyDown,
  } = useKanbanBoard({ tasks, allTasks, columns, onMoveTask, onRemoveColumn, onAnnounce });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {columns.some((column) => column.status === 'done') && (
        <div className="flex shrink-0 justify-end border-b border-secondary px-4 py-2">
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => {
              boardRef.current
                ?.querySelector<HTMLElement>('[data-column-status="done"]')
                ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            }}
          >
            نمایش ستون انجام شد
          </Button>
        </div>
      )}
      <div
        ref={boardRef}
        className="flex h-full min-h-0 gap-4 overflow-x-auto scroll-smooth p-4 scrollbar-thin"
        role="application"
        aria-label="بورد کانبان وظایف"
      >
        <p id={hintId} className="sr-only">
          Enter برای باز کردن وظیفه، فاصله برای برداشتن و جابه‌جایی با کلیدهای جهت‌نما.
        </p>

        {columns.map((column) => {
          const columnTasks = tasksInColumn(tasks, columns, column);
          const hiddenByFilter =
            filtered &&
            tasksInColumn(
              allTasks.filter((task) => !column.projectId || task.projectId === column.projectId),
              columns,
              column,
            ).length > 0;
          const isDropTarget = dropTarget === column.id;

          return (
            <section
              key={column.id}
              data-column-status={column.status}
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
                if (taskId) commitMove(taskId, column, false);
              }}
              className={cn(
                // Every column keeps one fixed width: a new column extends the row (the board
                // scrolls sideways) instead of squeezing the columns already there.
                'flex w-[320px] min-w-[320px] shrink-0 flex-col rounded-2xl border bg-sunken/60 transition-colors',
                isDropTarget ? 'border-brand bg-brand-subtle/50' : 'border-secondary',
                // A custom column carries its accent as a top stripe (declared after the
                // border colour so the stripe's top-edge colour wins).
                column.tone && cn('border-t-[3px]', TAG_STRIPE[column.tone]),
              )}
            >
              <ColumnHeader
                column={column}
                count={columnTasks.length}
                renaming={renamingId === column.id}
                editable={editable}
                canDelete={columns.length > 1}
                existingTitles={columns.filter((entry) => entry.id !== column.id).map((entry) => entry.title)}
                onStartRename={() => setRenamingId(column.id)}
                onRename={(title) => {
                  onRenameColumn(column.id, title);
                  setRenamingId(null);
                }}
                onCancelRename={() => setRenamingId(null)}
                onDelete={() => requestDelete(column)}
                onCreateTask={() => onCreateTask(column)}
              />

              <div className="flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3 scrollbar-thin">
                {columnTasks.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<TaskSquareIcon size={18} />}
                    title={hiddenByFilter ? 'وظیفه‌ای مطابق فیلتر نیست' : 'ستون خالی است'}
                    description={
                      hiddenByFilter
                        ? 'فیلترها یا عبارت جستجو را تغییر دهید.'
                        : 'کارتی را به اینجا بکشید یا وظیفه جدیدی بسازید.'
                    }
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
                        onOpen={onOpenTask}
                        selected={selectedTaskId === task.id}
                        grabbed={grabbedId === task.id}
                        describedBy={hintId}
                        onKeyDown={handleCardKeyDown(task)}
                        onToggleComplete={(completed) => onToggleComplete(task.id, completed)}
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

        {editable ? (
          <AddColumnCard
            existingTitles={columns.map((column) => column.title)}
            onAdd={onAddColumn}
            onOpen={revealBoardEnd}
          />
        ) : (
          <p className="flex w-56 shrink-0 items-center rounded-2xl border-2 border-dashed border-secondary px-4 text-center text-caption leading-6 text-fg-tertiary">
            هر پروژه ستون‌های خودش را دارد. برای افزودن یا ویرایش ستون، پروژه‌ای را از فهرست کنار انتخاب کنید.
          </p>
        )}

        <DeleteColumnDialog
          column={deleting}
          columns={columns}
          load={deleting ? columnLoad(deleting) : 0}
          onClose={() => setDeleting(null)}
          onConfirm={(disposition) => {
            if (deleting) onRemoveColumn(deleting.id, disposition);
            setDeleting(null);
          }}
        />
      </div>
    </div>
  );
}
