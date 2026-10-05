'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectDraft, SemanticTone, Task, TaskStatus, TaskViewMode } from '@/types';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { filterTasks, projectById, usersByIds } from '@/store/selectors';
import { formatJalali } from '@/lib/jalali';
import { formatCount } from '@/lib/format';
import { AppShell, useShellActions } from '@/components/layout/AppShell';
import { TaskSidebar } from '@/components/tasks/TaskSidebar';
import { ProjectMembersBar } from '@/components/tasks/ProjectMembersBar';
import { CreateProjectModal } from '@/components/tasks/CreateProjectModal';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { TaskListView } from '@/components/tasks/TaskListView';
import { GanttView } from '@/components/tasks/GanttView';
import { SwipeableTaskRow } from '@/components/tasks/SwipeableTaskRow';
import { PostponeSheet } from '@/components/tasks/PostponeSheet';
import { BLANK_TASK_DRAFT } from '@/components/tasks/CreateTaskModal';
import { Badge, Button, EmptyState, SegmentedControl } from '@/components/ui';
import { AddIcon, FilterIcon, GanttIcon, KanbanIcon, ListIcon, TaskSquareIcon } from '@/components/icons';

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
        projects: state.projects,
        assigneeId: state.assigneeFilterId,
      }),
    [
      state.tasks,
      state.smartView,
      state.projectFilterId,
      state.taskSearch,
      state.projects,
      state.assigneeFilterId,
      currentUser.id,
    ],
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
  const { state, dispatch } = useWorkspace();
  const { openTaskComposer } = useShellActions();
  const [projectModalOpen, setProjectModalOpen] = useState(false);

  return (
    <>
    <TaskSidebar
      projects={state.projects}
      tasks={tasks}
      smartView={state.smartView}
      projectFilterId={state.projectFilterId}
      search={state.taskSearch}
      currentUserId={currentUserId}
      onSmartViewChange={(view) => {
        dispatch({ type: 'set-smart-view', view });
        onNavigate();
      }}
      onProjectChange={(projectId) => {
        dispatch({ type: 'set-project-filter', projectId });
        onNavigate();
      }}
      onSearchChange={(query) => dispatch({ type: 'set-task-search', query })}
      onCreateTask={() => {
        onNavigate();
        openTaskComposer(null);
      }}
      onCreateProject={() => {
        onNavigate();
        setProjectModalOpen(true);
      }}
    />
    <CreateProjectModal
      open={projectModalOpen}
      currentUserId={currentUserId}
      onClose={() => setProjectModalOpen(false)}
      onCreate={(draft: ProjectDraft) => dispatch({ type: 'create-project', draft })}
    />
    </>
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
  const { openTaskComposer } = useShellActions();
  const router = useRouter();
  const [postponeTarget, setPostponeTarget] = useState<Task | null>(null);

  const selectedTaskId = state.inspector.kind === 'task' ? state.inspector.taskId : null;
  const openTask = (taskId: string) => dispatch({ type: 'open-task', taskId });

  // The members bar only makes sense when the board is scoped to a single project.
  const activeProject = state.projectFilterId
    ? projectById(state.projects, state.projectFilterId)
    : null;
  const projectMembers = activeProject ? usersByIds(activeProject.memberIds) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-secondary bg-surface px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-heading-sm font-bold text-fg-primary">
            {activeProject ? activeProject.name : 'پروژه‌ها و وظایف'}
          </h1>
          <span className="numeric text-caption text-fg-tertiary">
            {`${formatCount(tasks.length)} وظیفه در نمای فعلی`}
          </span>
        </div>

        {activeProject && (
          <ProjectMembersBar
            project={activeProject}
            members={projectMembers}
            activeAssigneeId={state.assigneeFilterId}
            onFilterByAssignee={(userId) => dispatch({ type: 'set-assignee-filter', userId })}
            onAddMember={(userId) =>
              dispatch({ type: 'add-project-member', projectId: activeProject.id, userId })
            }
            onOpenProjectChat={
              activeProject.conversationId
                ? () => {
                    dispatch({
                      type: 'select-conversation',
                      conversationId: activeProject.conversationId ?? '',
                    });
                    router.push('/chats');
                  }
                : null
            }
            className="w-full lg:w-auto"
          />
        )}

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
            ]}
          />
          <Button
            iconStart={<AddIcon size={18} />}
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
            tasks={tasks}
            projects={state.projects}
            columns={state.columns}
            selectedTaskId={selectedTaskId}
            onOpenTask={openTask}
            onMoveTask={(taskId, columnId) => dispatch({ type: 'move-task-to-column', taskId, columnId })}
            onAddColumn={(title: string, tone: SemanticTone, mapsTo: TaskStatus) =>
              dispatch({ type: 'add-column', title, tone, mapsTo })
            }
            onRemoveColumn={(columnId) => dispatch({ type: 'remove-column', columnId })}
            onCreateTask={(status) =>
              openTaskComposer({
                ...BLANK_TASK_DRAFT,
                projectId: state.projectFilterId ?? tasks[0]?.projectId ?? '',
                status,
              })
            }
            onAnnounce={(message) => dispatch({ type: 'announce', message })}
          />
        )}
        {view === 'list' && (
          <TaskListView
            tasks={tasks}
            projects={state.projects}
            onOpenTask={openTask}
            selectedTaskId={selectedTaskId}
          />
        )}
        {view === 'gantt' && (
          <GanttView
            tasks={tasks}
            projects={state.projects}
            onOpenTask={openTask}
            selectedTaskId={selectedTaskId}
          />
        )}
      </div>

      {/*
        Mobile: a single swipeable list. Board columns do not fit a 375px viewport, so the
        board's semantics move into per-row gestures instead of a horizontal scroller.
      */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 md:hidden">
        {tasks.length === 0 ? (
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
              {tasks.map((task) => (
                <SwipeableTaskRow
                  key={task.id}
                  task={task}
                  onOpen={openTask}
                  onComplete={(taskId) => {
                    dispatch({ type: 'move-task', taskId, status: 'done' });
                    dispatch({ type: 'announce', message: `وظیفه «${task.title}» انجام شد.` });
                  }}
                  onPostpone={setPostponeTarget}
                />
              ))}
            </ul>
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
