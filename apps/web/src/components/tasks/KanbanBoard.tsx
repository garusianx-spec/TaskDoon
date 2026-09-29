'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { BoardColumn, TagTone, Task } from '@taskin/contracts';
import type { ColumnDisposition } from '@/store/workspace-reducer';
import { TAG_TONES, statusLabel } from '@/data/reference';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { TAG_DOT, TAG_STRIPE } from '@/lib/tag-tone';
import { columnForTask, tasksInColumn } from '@/store/selectors';
import { useNamespacedId } from '@/hooks/useId';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Badge, Button, EmptyState, IconButton, Input, Modal, Popover, Select, Tooltip } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { TaskCard } from './TaskCard';
import { ColumnDot } from './ColumnDot';
import { AddIcon, ArchiveIcon, CheckIcon, EditIcon, MoreHorizontalIcon, TaskSquareIcon, TrashIcon } from '@/components/icons';

export interface KanbanBoardProps {
  /** The cards to show — already narrowed by the sidebar's filters and the header search. */
  readonly tasks: readonly Task[];
  /** Every task, unfiltered: deleting a column must account for cards the filters hide. */
  readonly allTasks: readonly Task[];
  readonly columns: readonly BoardColumn[];
  /**
   * A project's own board: its columns can be added, renamed and deleted. Views across projects
   * group cards by status, so their (status) columns are not edited. Defaults to `true`.
   */
  readonly editable?: boolean;
  readonly onOpenTask: (taskId: string) => void;
  readonly onMoveTask: (taskId: string, columnId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
  readonly onCreateTask: (column: BoardColumn) => void;
  readonly onAddColumn: (title: string, tone: TagTone) => void;
  readonly onRenameColumn: (columnId: string, title: string) => void;
  readonly onRemoveColumn: (columnId: string, disposition: ColumnDisposition) => void;
  readonly selectedTaskId: string | null;
  readonly onAnnounce: (message: string) => void;
}

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [grabbedId, setGrabbedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BoardColumn | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const knownColumns = useRef<readonly string[]>(columns.map((column) => column.id));
  const hintId = useNamespacedId('kanban-hint-');

  /**
   * Smooth-scrolls to the board's far end, where new columns appear. In RTL that is the left
   * edge, which browsers address with a *negative* `scrollLeft`.
   */
  const revealBoardEnd = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const overflow = board.scrollWidth - board.clientWidth;
    const rtl = getComputedStyle(board).direction === 'rtl';
    board.scrollTo({ left: rtl ? -overflow : overflow, behavior: 'smooth' });
  }, []);

  // A column just added sits next to the add card at the far end; keep that end in view.
  useEffect(() => {
    const added = columns.some((column) => !knownColumns.current.includes(column.id));
    knownColumns.current = columns.map((column) => column.id);
    if (added) requestAnimationFrame(revealBoardEnd);
  }, [columns, revealBoardEnd]);

  // A column holds its own project's cards only.
  const columnLoad = (column: BoardColumn): number =>
    tasksInColumn(
      allTasks.filter((task) => column.projectId === undefined || task.projectId === column.projectId),
      columns,
      column,
    ).length;

  const requestDelete = (column: BoardColumn) => {
    if (columnLoad(column) === 0) {
      onRemoveColumn(column.id, { kind: 'archive' });
    } else {
      setDeleting(column);
    }
  };

  const commitMove = useCallback(
    (taskId: string, column: BoardColumn, viaKeyboard: boolean) => {
      onMoveTask(taskId, column.id);
      const task = tasks.find((entry) => entry.id === taskId);
      if (task) onAnnounce(`وظیفه «${task.title}» به ستون ${column.title} منتقل شد.`);
      if (viaKeyboard) {
        // Focus follows the card across the DOM move.
        requestAnimationFrame(() => cardRefs.current.get(taskId)?.focus());
      }
    },
    [onMoveTask, onAnnounce, tasks],
  );

  const handleCardKeyDown = useCallback(
    (task: Task) => (event: React.KeyboardEvent<HTMLElement>) => {
      // Keys typed inside the card's own controls (the checkbox) are theirs to handle.
      if (event.target !== event.currentTarget) return;
      const current = columnForTask(columns, task);

      if (event.key === ' ') {
        event.preventDefault();
        if (grabbedId === task.id) {
          setGrabbedId(null);
          onAnnounce(`وظیفه «${task.title}» در ستون ${current?.title ?? statusLabel(task.status)} رها شد.`);
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
      const columnIndex = columns.findIndex((column) => column.id === current?.id);
      const nextColumn = columns[columnIndex + delta];
      if (!nextColumn) {
        onAnnounce(delta > 0 ? 'انتهای بورد است.' : 'ابتدای بورد است.');
        return;
      }
      commitMove(task.id, nextColumn, true);
    },
    [grabbedId, columns, commitMove, onAnnounce],
  );

  return (
    <div
      ref={boardRef}
      className="scrollbar-thin flex h-full min-h-0 gap-4 overflow-x-auto scroll-smooth p-4"
      role="application"
      aria-label="بورد کانبان وظایف"
    >
      <p id={hintId} className="sr-only">
        Enter برای باز کردن وظیفه، فاصله برای برداشتن و جابه‌جایی با کلیدهای جهت‌نما.
      </p>

      {columns.map((column) => {
        const columnTasks = tasksInColumn(tasks, columns, column);
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
  );
}

interface ColumnHeaderProps {
  readonly column: BoardColumn;
  readonly count: number;
  readonly renaming: boolean;
  /** `false` on the status columns of views across projects: no ⋯ menu. */
  readonly editable: boolean;
  readonly canDelete: boolean;
  readonly existingTitles: readonly string[];
  readonly onStartRename: () => void;
  readonly onRename: (title: string) => void;
  readonly onCancelRename: () => void;
  readonly onDelete: () => void;
  readonly onCreateTask: () => void;
}

/** Column title row: colour key, name (inline-editable), count, add-task and the ⋯ menu. */
function ColumnHeader({
  column,
  count,
  renaming,
  editable,
  canDelete,
  existingTitles,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
  onCreateTask,
}: ColumnHeaderProps) {
  const [draft, setDraft] = useState(column.title);
  const [error, setError] = useState<string | undefined>(undefined);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!renaming) return;
    setDraft(column.title);
    setError(undefined);
  }, [renaming, column.title]);

  const commit = () => {
    const title = draft.trim();
    if (!title) return setError('نام ستون را وارد کنید.');
    if (existingTitles.some((existing) => existing.trim() === title)) return setError('ستونی با این نام وجود دارد.');
    onRename(title);
    requestAnimationFrame(() => menuTriggerRef.current?.focus());
  };

  const cancel = () => {
    onCancelRename();
    requestAnimationFrame(() => menuTriggerRef.current?.focus());
  };

  if (renaming) {
    return (
      <form
        className="flex flex-col gap-1 px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          commit();
        }}
      >
        <Input
          label={`نام تازه ستون ${column.title}`}
          hideLabel
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              cancel();
            }
          }}
          onBlur={(event) => {
            // Leaving the field by clicking elsewhere saves, unless focus moved to the
            // form's own buttons.
            if (!event.currentTarget.form?.contains(event.relatedTarget)) commit();
          }}
          error={error}
          maxLength={32}
          autoFocus
          className="h-8 text-body-sm"
        />
      </form>
    );
  }

  return (
    <header className="flex items-center gap-2 px-3 py-3">
      <ColumnDot column={column} />
      <h3 className="truncate text-title-sm font-semibold text-fg-primary">{column.title}</h3>
      <Badge tone="neutral" size="sm" numeric>
        {formatCount(count)}
      </Badge>
      <span className="ms-auto flex items-center gap-0.5">
        <Tooltip content={`افزودن وظیفه به ${column.title}`}>
          <IconButton
            label={`افزودن وظیفه به ${column.title}`}
            icon={<AddIcon size={16} />}
            size="xs"
            onClick={onCreateTask}
          />
        </Tooltip>
        {editable && (
          <Popover
            label={`اقدام‌های ستون ${column.title}`}
            haspopup="menu"
            align="end"
            panelClassName="min-w-48"
            trigger={
              <IconButton
                ref={menuTriggerRef}
                label={`اقدام‌های ستون ${column.title}`}
                icon={<MoreHorizontalIcon size={16} />}
                size="xs"
              />
            }
          >
            {(close) => (
              <MenuList>
                <MenuItem
                  icon={<EditIcon size={16} />}
                  onSelect={() => {
                    close();
                    onStartRename();
                  }}
                >
                  تغییر نام ستون
                </MenuItem>
                <MenuItem
                  icon={<TrashIcon size={16} />}
                  tone="danger"
                  disabled={!canDelete}
                  onSelect={() => {
                    close();
                    onDelete();
                  }}
                >
                  {canDelete ? 'حذف ستون' : 'حذف ستون (آخرین ستون بورد)'}
                </MenuItem>
              </MenuList>
            )}
          </Popover>
        )}
      </span>
    </header>
  );
}

interface DeleteColumnDialogProps {
  readonly column: BoardColumn | null;
  readonly columns: readonly BoardColumn[];
  /** Cards in the column across the whole workspace, not only the filtered view. */
  readonly load: number;
  readonly onClose: () => void;
  readonly onConfirm: (disposition: ColumnDisposition) => void;
}

/** Confirms deleting a column that still holds cards: migrate them elsewhere, or archive them. */
function DeleteColumnDialog({ column, columns, load, onClose, onConfirm }: DeleteColumnDialogProps) {
  const others = columns.filter((entry) => entry.id !== column?.id);
  const [choice, setChoice] = useState<'migrate' | 'archive'>('migrate');
  const [targetId, setTargetId] = useState('');
  const id = useNamespacedId('delete-column-');

  useResetOnOpen(
    column !== null,
    () => {
      if (!column) return;
      setChoice('migrate');
      // Default to a column that keeps the cards' status (a custom column's cards are in
      // progress), so migrating never silently completes or reopens work; else a neighbour.
      const index = columns.findIndex((entry) => entry.id === column.id);
      const sameStatus = columns.find((entry) => entry.id !== column.id && entry.status === column.status);
      setTargetId((sameStatus ?? columns[index - 1] ?? columns[index + 1])?.id ?? '');
    },
    column,
  );

  const options = [
    {
      value: 'migrate' as const,
      title: 'انتقال به ستون دیگر',
      description: 'کارت‌ها با همان وضعیت ستون مقصد ادامه پیدا می‌کنند.',
      Icon: TaskSquareIcon,
    },
    {
      value: 'archive' as const,
      title: 'بایگانی وظایف',
      description: 'کارت‌ها از بورد، فهرست و گانت کنار می‌روند.',
      Icon: ArchiveIcon,
    },
  ];

  return (
    <Modal
      open={column !== null}
      onClose={onClose}
      size="sm"
      title={column ? `حذف ستون «${column.title}»` : ''}
      description={`این ستون ${formatCount(load)} وظیفه دارد. پیش از حذف مشخص کنید چه بر سر آن‌ها بیاید.`}
      icon={<TrashIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="destructive"
            disabled={choice === 'migrate' && !targetId}
            onClick={() => onConfirm(choice === 'migrate' ? { kind: 'migrate', targetColumnId: targetId } : { kind: 'archive' })}
          >
            {choice === 'migrate' ? 'انتقال و حذف ستون' : 'بایگانی و حذف ستون'}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">سرنوشت وظایف این ستون</legend>
        {options.map(({ value, title, description, Icon }) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
              choice === value ? 'border-brand bg-brand-subtle' : 'border-secondary hover:bg-hover',
            )}
          >
            <input
              type="radio"
              name={`${id}-choice`}
              value={value}
              checked={choice === value}
              onChange={() => setChoice(value)}
              className="mt-1 size-4 shrink-0"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-fg-primary">
                <Icon size={16} className="text-fg-tertiary" />
                {title}
              </span>
              <span className="text-caption text-fg-tertiary">{description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {choice === 'migrate' && (
        <div className="mt-4">
          <Select
            label="ستون مقصد"
            hideLabel={false}
            value={targetId}
            onValueChange={setTargetId}
            options={others.map((entry) => ({
              value: entry.id,
              label: entry.title,
              icon: <ColumnDot column={entry} />,
            }))}
          />
        </div>
      )}
    </Modal>
  );
}

interface AddColumnCardProps {
  readonly existingTitles: readonly string[];
  readonly onAdd: (title: string, tone: TagTone) => void;
  /** Scrolls the board so the column being drafted is fully in view. */
  readonly onOpen: () => void;
}

/**
 * Dashed "+ افزودن ستون جدید" card. Collapsed it is a single button; activated it spawns a
 * column-shaped draft — name plus an accent colour — at the board's far end, scrolls it into
 * view and puts the caret in its name field. Submitting appends the column.
 */
function AddColumnCard({ existingTitles, onAdd, onOpen }: AddColumnCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [tone, setTone] = useState<TagTone>('blue');
  const [error, setError] = useState<string | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const id = useNamespacedId('add-column-');

  useEffect(() => {
    if (!editing) return;
    // Scroll first, then focus without letting the browser jump-scroll instead.
    const frame = requestAnimationFrame(() => {
      onOpen();
      nameRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, onOpen]);
  const { registerItem, onKeyDown } = useRovingFocus(TAG_TONES.length, 'horizontal', {
    onActivate: (index) => {
      const entry = TAG_TONES[index];
      if (entry) setTone(entry.id);
    },
  });

  const reset = () => {
    setEditing(false);
    setTitle('');
    setTone('blue');
    setError(undefined);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = title.trim();
    if (!name) {
      setError('نام ستون را وارد کنید.');
      return;
    }
    if (existingTitles.some((existing) => existing.trim() === name)) {
      setError('ستونی با این نام وجود دارد.');
      return;
    }
    onAdd(name, tone);
    reset();
  };

  if (!editing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'flex w-36 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary px-3 text-center',
          'text-body-sm font-semibold text-fg-tertiary transition-colors',
          'hover:border-brand hover:bg-brand-subtle/40 hover:text-fg-brand',
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-sunken" aria-hidden="true">
          <AddIcon size={20} />
        </span>
        افزودن ستون جدید
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          reset();
        }
      }}
      aria-labelledby={`${id}-title`}
      className="flex w-72 shrink-0 animate-scale-in flex-col gap-3 rounded-2xl border-2 border-dashed border-brand bg-surface p-3 shadow-xs"
    >
      <h3 id={`${id}-title`} className="text-title-sm font-semibold text-fg-primary">
        ستون جدید
      </h3>
      <Input
        ref={nameRef}
        label="نام ستون"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setError(undefined);
        }}
        placeholder="مثلاً: تست کیفیت"
        error={error}
        maxLength={32}
      />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-body-sm font-medium text-fg-secondary">رنگ شاخص</legend>
        <div role="radiogroup" aria-label="رنگ شاخص ستون" onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
          {TAG_TONES.map((entry, index) => {
            const selected = entry.id === tone;
            return (
              <button
                key={entry.id}
                ref={registerItem(index)}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={entry.label}
                title={entry.label}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTone(entry.id)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition-shadow',
                  TAG_DOT[entry.id],
                  selected ? 'ring-2 ring-brand' : 'hover:ring-2 hover:ring-gray-300',
                )}
              >
                {selected && <CheckIcon size={14} />}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="text-micro text-fg-tertiary">کارت‌های این ستون در فیلترها و گزارش‌ها «در حال انجام» شمرده می‌شوند.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" fullWidth iconStart={<AddIcon size={16} />}>
          افزودن ستون
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={reset}>
          انصراف
        </Button>
      </div>
    </form>
  );
}
