'use client';

import { useMemo, useState } from 'react';
import type { IssueType, Task, TaskViewMode } from '@taskin/contracts';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { filterTasks, projectColumns } from '@/store/selectors';
import { BUILT_IN_COLUMNS } from '@/data/reference';
import { taskDraft } from '@/store/drafts';
import { formatJalali } from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { AppShell } from '@/components/layout/AppShell';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { TaskSidebar } from '@/components/tasks/TaskSidebar';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { TaskListView } from '@/components/tasks/TaskListView';
import { GanttView } from '@/components/tasks/GanttView';
import { SwipeableTaskRow } from '@/components/tasks/SwipeableTaskRow';
import { PostponeSheet } from '@/components/tasks/PostponeSheet';
import { BacklogView } from '@/components/tasks/agile/BacklogView';
import { IssueTypeIcon } from '@/components/tasks/agile/IssueTypeIcon';
import { ISSUE_TYPES, isBacklog, issueTypeOf } from '@/lib/agile';
import { Badge, Button, EmptyState, ExpandableSearch, SegmentedControl, Select } from '@/components/ui';
import { AddIcon, BacklogIcon, FilterIcon, GanttIcon, KanbanIcon, ListIcon, TaskSquareIcon } from '@/components/icons';

export default function TasksPage() {
  const { state, dispatch, currentUser } = useWorkspace();
  // Mobile only: the contextual sidebar is a togglable panel rather than the tab body,
  // so the task list itself is what the "وظایف من" tab opens on.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const tasks = useMemo(
    () =>
      filterTasks(state.tasks, {
        smartView: state.smartView,
        projectId: state.projectFilterId,
        search: state.taskSearch,
        currentUserId: currentUser.id,
      }),
    [state.tasks, state.smartView, state.projectFilterId, state.taskSearch, currentUser.id],
  );

  return (
    <AppShell
      sidebar={
        <TaskSidebarContainer
          tasks={state.tasks}
          currentUserId={currentUser.id}
          onNavigate={() => setMobileFiltersOpen(false)}
        />
      }
      mobileShowsDetail={!mobileFiltersOpen}
    >
      <TaskWorkspace
        tasks={tasks}
        view={state.taskView}
        onViewChange={(view) => dispatch({ type: 'set-task-view', view })}
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
      />
    </AppShell>
  );
}

function TaskSidebarContainer({
  tasks,
  currentUserId,
  onNavigate,
}: {
  readonly tasks: readonly Task[];
  readonly currentUserId: string;
  /** Closes the mobile filter panel once a selection is made. */
  readonly onNavigate: () => void;
}) {
  const { state, dispatch, isWorkspaceOwner } = useWorkspace();
  const { open } = useOverlays();

  return (
    <TaskSidebar
      tasks={tasks}
      smartView={state.smartView}
      projectFilterId={state.projectFilterId}
      currentUserId={currentUserId}
      onSmartViewChange={(view) => {
        dispatch({ type: 'set-smart-view', view });
        onNavigate();
      }}
      onProjectChange={(projectId) => {
        dispatch({ type: 'set-project-filter', projectId });
        onNavigate();
      }}
      onCreateProject={() => open({ kind: 'project-composer' })}
      // Deleting (to the trash) and restoring projects are the workspace owner's alone.
      {...(isWorkspaceOwner
        ? {
            onDeleteProject: (projectId: string) => open({ kind: 'project-delete', projectId }),
            onOpenTrash: () => {
              dispatch({ type: 'load-project-trash' });
              open({ kind: 'project-trash' });
            },
          }
        : {})}
    />
  );
}

interface TaskWorkspaceProps {
  readonly tasks: readonly Task[];
  readonly view: TaskViewMode;
  readonly onViewChange: (view: TaskViewMode) => void;
  readonly onOpenMobileFilters: () => void;
}

function TaskWorkspace({ tasks, view, onViewChange, onOpenMobileFilters }: TaskWorkspaceProps) {
  const { state, dispatch } = useWorkspace();
  const { openTaskComposer } = useOverlays();
  const [postponeTarget, setPostponeTarget] = useState<Task | null>(null);
  const [typeFilter, setTypeFilter] = useState<IssueType | 'all'>('all');

  const selectedTaskId = state.inspector.kind === 'task' ? state.inspector.taskId : null;
  // A project's board shows its own columns; views across projects group every card by status,
  // and their columns are not edited.
  const boardProjectId = state.projectFilterId;
  const boardColumns = boardProjectId ? projectColumns(state.boardColumns, boardProjectId) : BUILT_IN_COLUMNS;
  const columnsEditable = boardProjectId !== null && state.boardColumns.some((column) => column.projectId === boardProjectId);
  const openTask = (taskId: string) => dispatch({ type: 'open-task', taskId });
  const toggleComplete = (taskId: string, completed: boolean) =>
    dispatch({ type: 'set-task-completed', taskId, completed });
  // Agile tracking: the board, list and Gantt show board items of the chosen type; the backlog
  // tab shows the rest. With no type chosen and nothing in the backlog, `boardTasks` is `tasks`
  // itself, so the board gets exactly what it always did.
  const ofType = (task: Task) => typeFilter === 'all' || issueTypeOf(task) === typeFilter;
  const boardTasks = useMemo(() => {
    const kept = tasks.filter((task) => !isBacklog(task) && (typeFilter === 'all' || issueTypeOf(task) === typeFilter));
    return kept.length === tasks.length ? tasks : kept;
  }, [tasks, typeFilter]);
  const backlogTasks = tasks.filter((task) => isBacklog(task) && ofType(task));
  const openTasks = boardTasks.filter((task) => task.status !== 'done');
  const completedTasks = boardTasks.filter((task) => task.status === 'done');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-secondary bg-surface px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-heading-sm font-bold text-fg-primary">پروژه‌ها و وظایف</h1>
          <span className="numeric text-caption text-fg-tertiary">
            {`${formatCount(view === 'backlog' ? backlogTasks.length : boardTasks.length)} وظیفه در نمای فعلی`}
          </span>
        </div>

        <div className="ms-auto flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconStart={<FilterIcon size={16} />}
            onClick={onOpenMobileFilters}
            className="lg:hidden"
          >
            فیلترها
          </Button>
          <div className="hidden w-40 md:block">
            <Select
              label="فیلتر نوع وظیفه"
              size="sm"
              value={typeFilter}
              onValueChange={setTypeFilter}
              options={[
                { value: 'all' as const, label: 'همه نوع‌ها' },
                ...ISSUE_TYPES.map((entry) => ({ value: entry.id, label: entry.label, icon: <IssueTypeIcon type={entry.id} showTask decorative size={15} /> })),
              ]}
            />
          </div>
          <SegmentedControl
            ariaLabel="حالت نمایش وظایف"
            size="md"
            value={view}
            onValueChange={onViewChange}
            className="hidden md:inline-flex"
            options={[
              { value: 'board', label: 'بورد', icon: <KanbanIcon size={16} /> },
              { value: 'list', label: 'فهرست', icon: <ListIcon size={16} /> },
              { value: 'gantt', label: 'گانت', icon: <GanttIcon size={16} /> },
              { value: 'backlog', label: 'بک‌لاگ', icon: <BacklogIcon size={16} /> },
            ]}
          />
          <ExpandableSearch
            label="جستجوی وظیفه"
            placeholder="عنوان، کد یا برچسب…"
            value={state.taskSearch}
            onChange={(query) => dispatch({ type: 'set-task-search', query })}
          />
          <Button
            iconStart={<AddIcon size={18} />}
            aria-keyshortcuts="N"
            onClick={() => openTaskComposer(null)}
            className="hidden sm:inline-flex"
          >
            وظیفه جدید
          </Button>
        </div>
      </header>

      {/* Desktop and tablet: board / list / gantt */}
      <div className="hidden min-h-0 flex-1 md:flex md:flex-col">
        {view === 'board' && (
          <KanbanBoard
            tasks={boardTasks}
            allTasks={state.tasks}
            columns={boardColumns}
            editable={columnsEditable}
            selectedTaskId={selectedTaskId}
            onOpenTask={openTask}
            onMoveTask={(taskId, columnId) => dispatch({ type: 'move-task-to-column', taskId, columnId })}
            onToggleComplete={toggleComplete}
            onCreateTask={(column) =>
              openTaskComposer(
                taskDraft({
                  projectId: state.projectFilterId ?? tasks[0]?.projectId ?? taskDraft().projectId,
                  status: column.status,
                  boardColumnId: column.custom ? column.id : null,
                }),
              )
            }
            onAddColumn={(title, tone) => {
              if (boardProjectId) dispatch({ type: 'add-board-column', projectId: boardProjectId, title, tone });
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
              openTaskComposer(taskDraft({ projectId: state.projectFilterId ?? tasks[0]?.projectId ?? taskDraft().projectId, isBacklog: true }))
            }
          />
        )}
      </div>

      {/*
        Mobile: a single swipeable list. Board columns do not fit a 375px viewport, so the
        board's semantics move into per-row gestures instead of a horizontal scroller.
      */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 md:hidden">
        {boardTasks.length === 0 ? (
          <EmptyState
            icon={<TaskSquareIcon size={26} />}
            title="وظیفه‌ای یافت نشد"
            description="فیلتر پروژه یا نمای هوشمند را تغییر دهید."
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
