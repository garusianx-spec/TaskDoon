'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import type { IssueType, Task, TaskViewMode } from '@taskin/contracts';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { projectColumns, type TaskScopeFilter } from '@/store/selectors';
import { BUILT_IN_COLUMNS } from '@/data/reference';
import { taskDraft } from '@/store/drafts';
import { formatJalali } from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { KanbanBoard } from '@/features/board/components/KanbanBoard';
import { TaskListView } from '@/features/board/components/TaskListView';
import { GanttView } from '@/features/board/components/GanttView';
import { SwipeableTaskRow } from '@/features/tasks/components/SwipeableTaskRow';
import { PostponeSheet } from '@/features/tasks/components/PostponeSheet';
import { BacklogView } from '@/features/agile/components/BacklogView';
import { IssueTypeIcon } from '@/features/agile/components/IssueTypeIcon';
import { ISSUE_TYPES, isBacklog, issueTypeOf } from '@/features/agile/lib/agile';
import { Badge, Button, ExpandableSearch, SegmentedControl, Select } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  AddIcon,
  BacklogIcon,
  FilterIcon,
  GanttIcon,
  KanbanIcon,
  ListIcon,
  TaskSquareIcon,
} from '@/components/icons';

interface TaskWorkspaceProps {
  readonly tasks: readonly Task[];
  readonly title: string;
  readonly scope: 'legacy' | 'personal' | 'project';
  readonly boardProjectId: string | null;
  readonly search: string;
  readonly onSearch: (query: string) => void;
  readonly view: TaskViewMode;
  readonly onViewChange: (view: TaskViewMode) => void;
  readonly navigation?: ReactNode;
  readonly smartFilter?: {
    readonly value: TaskScopeFilter;
    readonly options: ReadonlyArray<{ readonly value: TaskScopeFilter; readonly label: string }>;
    readonly onChange: (filter: TaskScopeFilter) => void;
  };
}

const ISSUE_TYPE_OPTIONS = [
  { value: 'all' as const, label: 'همه نوع‌ها' },
  ...ISSUE_TYPES.map((entry) => ({
    value: entry.id,
    label: entry.label,
    icon: <IssueTypeIcon type={entry.id} showTask decorative size={15} />,
  })),
];

const TASK_VIEWS = [
  { value: 'board', label: 'بورد', icon: <KanbanIcon size={16} /> },
  { value: 'list', label: 'فهرست', icon: <ListIcon size={16} /> },
  { value: 'gantt', label: 'گانت', icon: <GanttIcon size={16} /> },
  { value: 'backlog', label: 'بک‌لاگ', icon: <BacklogIcon size={16} /> },
] satisfies ReadonlyArray<{ value: TaskViewMode; label: string; icon: ReactNode }>;

export function TaskWorkspace({
  tasks,
  title,
  scope,
  boardProjectId,
  search,
  onSearch,
  view,
  onViewChange,
  navigation,
  smartFilter,
}: TaskWorkspaceProps) {
  const { state, dispatch } = useWorkspace();
  const { openTaskComposer } = useOverlays();
  const [postponeTarget, setPostponeTarget] = useState<Task | null>(null);
  const [typeFilter, setTypeFilter] = useState<IssueType | 'all'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const personal = scope === 'personal';
  const project = scope === 'project';

  const selectedTaskId = state.inspector.kind === 'task' ? state.inspector.taskId : null;
  // A project's board shows its own columns; views across projects group every card by status,
  // and their columns are not edited.
  const boardColumns = boardProjectId ? projectColumns(state.boardColumns, boardProjectId) : BUILT_IN_COLUMNS;
  const columnsEditable =
    boardProjectId !== null && state.boardColumns.some((column) => column.projectId === boardProjectId);
  const openTask = (taskId: string) => dispatch({ type: 'open-task', taskId });
  const toggleComplete = (taskId: string, completed: boolean) =>
    dispatch({ type: 'set-task-completed', taskId, completed });
  // Project views split board and backlog items. Personal results include both.
  const matchingTasks = useMemo(
    () => (typeFilter === 'all' ? tasks : tasks.filter((task) => issueTypeOf(task) === typeFilter)),
    [tasks, typeFilter],
  );
  const boardTasks = matchingTasks.filter((task) => !isBacklog(task));
  const backlogTasks = matchingTasks.filter(isBacklog);
  const visibleTasks = personal ? matchingTasks : view === 'backlog' ? backlogTasks : boardTasks;
  const openTasks = visibleTasks.filter((task) => task.status !== 'done');
  const completedTasks = visibleTasks.filter((task) => task.status === 'done');
  const activeFilters = [
    smartFilter && smartFilter.value !== 'all'
      ? smartFilter.options.find((entry) => entry.value === smartFilter.value)?.label
      : undefined,
    typeFilter !== 'all' ? ISSUE_TYPE_OPTIONS.find((entry) => entry.value === typeFilter)?.label : undefined,
  ].filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-secondary bg-surface px-3 py-2 sm:px-4 sm:py-3">
        {navigation}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 grow basis-32">
            <h1 className="break-words text-heading-sm font-bold text-fg-primary">{title}</h1>
            <p className="text-caption text-fg-tertiary numeric">
              {personal
                ? `${formatCount(visibleTasks.length)} وظیفهٔ ارجاع‌شده به من در نتایج`
                : `${formatCount(visibleTasks.length)} وظیفه در نمای فعلی`}
            </p>
          </div>
          <div className="ms-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconStart={<FilterIcon size={16} />}
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              id={filtersId + '-toggle'}
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn('min-h-11', scope === 'legacy' && 'lg:hidden')}
            >
              فیلترها
            </Button>
            {scope === 'legacy' && (
              <div className="hidden w-40 lg:block">
                <Select
                  label="فیلتر نوع وظیفه"
                  size="sm"
                  value={typeFilter}
                  onValueChange={setTypeFilter}
                  options={ISSUE_TYPE_OPTIONS}
                />
              </div>
            )}
            <ExpandableSearch
              label="جستجوی وظیفه"
              placeholder="عنوان، کد یا برچسب…"
              value={search}
              onChange={onSearch}
            />
            <Button
              iconStart={<AddIcon size={18} />}
              aria-keyshortcuts="N"
              onClick={() => openTaskComposer(null)}
              className="min-h-11"
            >
              وظیفه جدید
            </Button>
          </div>
        </div>
        {activeFilters.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-caption text-fg-secondary">
            فیلترهای فعال
            {activeFilters.map((label) => (
              <Badge key={label} size="sm" tone="brand">
                {label}
              </Badge>
            ))}
          </p>
        )}
        <div
          id={filtersId}
          hidden={!filtersOpen}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
              event.stopPropagation();
              setFiltersOpen(false);
              document.getElementById(filtersId + '-toggle')?.focus();
            }
          }}
          className={cn(
            'mt-2 flex-wrap gap-2 rounded-lg border border-secondary bg-sunken p-2',
            scope === 'legacy' && 'lg:hidden',
          )}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {smartFilter && (
              <Select
                label="نمای وظایف"
                hideLabel={false}
                value={smartFilter.value}
                onValueChange={smartFilter.onChange}
                options={smartFilter.options}
              />
            )}
            <Select
              label="فیلتر نوع وظیفه"
              hideLabel={false}
              value={typeFilter}
              onValueChange={setTypeFilter}
              options={ISSUE_TYPE_OPTIONS}
            />
          </div>
          <Button
            className="mt-2 min-h-11"
            variant="secondary"
            onClick={() => {
              setFiltersOpen(false);
              document.getElementById(filtersId + '-toggle')?.focus();
            }}
          >
            نمایش نتایج
          </Button>
        </div>
        {!personal && (
          <SegmentedControl
            ariaLabel="حالت نمایش وظایف"
            size="md"
            value={view}
            onValueChange={onViewChange}
            className={cn(
              'mt-2 max-w-full overflow-x-auto',
              project ? '[&_[role=tab]]:min-h-11 max-sm:[&_[role=tab]]:px-2' : 'hidden md:inline-flex',
            )}
            options={TASK_VIEWS}
          />
        )}
      </header>

      {!personal && (
        <div
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col',
            project && view !== 'list' ? 'flex' : 'hidden md:flex',
          )}
        >
          {view === 'board' && (
            <KanbanBoard
              tasks={boardTasks}
              allTasks={state.tasks}
              columns={boardColumns}
              editable={columnsEditable}
              filtered={Boolean(search.trim() || activeFilters.length)}
              selectedTaskId={selectedTaskId}
              onOpenTask={openTask}
              onMoveTask={(taskId, columnId) => dispatch({ type: 'move-task-to-column', taskId, columnId })}
              onToggleComplete={toggleComplete}
              onCreateTask={(column) =>
                openTaskComposer(
                  taskDraft({
                    projectId: boardProjectId ?? tasks[0]?.projectId ?? taskDraft().projectId,
                    status: column.status,
                    boardColumnId: column.custom ? column.id : null,
                  }),
                )
              }
              onAddColumn={(title, tone) => {
                if (boardProjectId)
                  dispatch({ type: 'add-board-column', projectId: boardProjectId, title, tone });
              }}
              onRenameColumn={(columnId, title) => dispatch({ type: 'rename-board-column', columnId, title })}
              onRemoveColumn={(columnId, disposition) =>
                dispatch({ type: 'remove-board-column', columnId, disposition })
              }
              onAnnounce={(message) => dispatch({ type: 'announce', message })}
            />
          )}
          {view === 'list' && (
            <TaskListView
              tasks={boardTasks}
              columns={boardColumns}
              onOpenTask={openTask}
              onToggleComplete={toggleComplete}
              selectedTaskId={selectedTaskId}
            />
          )}
          {view === 'gantt' && (
            <GanttView tasks={boardTasks} onOpenTask={openTask} selectedTaskId={selectedTaskId} />
          )}
          {view === 'backlog' && (
            <BacklogView
              tasks={backlogTasks}
              selectedTaskId={selectedTaskId}
              onOpenTask={openTask}
              onMoveToBoard={(task) => {
                dispatch({ type: 'patch-task', taskId: task.id, patch: { isBacklog: false } });
                dispatch({ type: 'announce', message: `وظیفه «${task.title}» به بورد منتقل شد.` });
              }}
              onCreate={() =>
                openTaskComposer(
                  taskDraft({
                    projectId: boardProjectId ?? tasks[0]?.projectId ?? taskDraft().projectId,
                    isBacklog: true,
                  }),
                )
              }
            />
          )}
        </div>
      )}

      {(!project || view === 'list') && (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin',
            personal ? 'w-full self-center sm:max-w-3xl sm:px-6' : 'md:hidden',
          )}
        >
          {visibleTasks.length === 0 ? (
            <EmptyState
              icon={<TaskSquareIcon size={26} />}
              title="وظیفه‌ای یافت نشد"
              description="فیلترها یا عبارت جستجو را تغییر دهید."
              action={
                <Button size="sm" iconStart={<AddIcon size={16} />} onClick={() => openTaskComposer(null)}>
                  وظیفه جدید
                </Button>
              }
            />
          ) : (
            <>
              <p className="mb-2 flex items-center gap-2 px-1">
                <Badge tone="neutral" size="sm">
                  برای انجام‌شدن به راست و برای تعویق به چپ بکشید
                </Badge>
              </p>
              <ul className="flex flex-col gap-2.5">
                {openTasks.map((task) => (
                  <SwipeableTaskRow
                    key={task.id}
                    task={task}
                    onOpen={openTask}
                    onToggleComplete={toggleComplete}
                    onPostpone={setPostponeTarget}
                  />
                ))}
              </ul>
              {completedTasks.length > 0 && (
                <section aria-labelledby="mobile-completed" className="mt-5">
                  <h2
                    id="mobile-completed"
                    className="mb-2 flex items-center gap-2 px-1 text-caption font-semibold text-fg-secondary"
                  >
                    انجام‌شده
                    <Badge tone="done" size="sm" numeric>
                      {formatCount(completedTasks.length)}
                    </Badge>
                  </h2>
                  <ul className="flex flex-col gap-2.5">
                    {completedTasks.map((task) => (
                      <SwipeableTaskRow
                        key={task.id}
                        task={task}
                        onOpen={openTask}
                        onToggleComplete={toggleComplete}
                        onPostpone={setPostponeTarget}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}

      <PostponeSheet
        task={postponeTarget}
        onClose={() => setPostponeTarget(null)}
        onPostpone={(taskId, dueDate) => {
          dispatch({ type: 'patch-task', taskId, patch: { dueDate } });
          dispatch({
            type: 'announce',
            message: `مهلت وظیفه تا ${formatJalali(dueDate, 'medium')} تمدید شد.`,
          });
        }}
        onReassign={(taskId, userId) => {
          dispatch({ type: 'patch-task', taskId, patch: { assigneeIds: [userId] } });
          dispatch({ type: 'announce', message: 'وظیفه به همکار جدید ارجاع شد.' });
        }}
      />
    </div>
  );
}
