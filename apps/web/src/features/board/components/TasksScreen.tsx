'use client';

import { useState } from 'react';
import { toISODate } from '@taskin/jalali';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { filterTasks, tasksAssignedTo, type TaskScopeFilter } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { AppShell } from '@/components/layout/AppShell';
import { SectionBackLink } from '@/components/layout/NavigationList';
import { EmptyState } from '@/components/shared/EmptyState';
import { FolderIcon } from '@/components/icons';
import { workspaceRoutes } from '@/lib/workspace-navigation';
import { SMART_VIEWS } from '@/features/board/components/TaskSidebar';
import { TaskSidebarContainer } from '@/features/board/components/TaskSidebarContainer';
import { TaskWorkspace } from '@/features/board/components/TaskWorkspace';

const OVERDUE = { value: 'overdue', label: 'دارای تأخیر' } as const;
const LEGACY_FILTERS = SMART_VIEWS.map(({ id, label }) => ({ value: id, label }));
const PERSONAL_FILTERS = [
  { value: 'all', label: 'همهٔ کارهای من' },
  OVERDUE,
  { value: 'due-soon', label: 'سررسید نزدیک' },
  { value: 'starred', label: 'ستاره‌دار' },
] as const;
const PROJECT_FILTERS = [{ value: 'all', label: 'همهٔ وظایف پروژه' }, OVERDUE, PERSONAL_FILTERS[2]] as const;

export function TasksPage() {
  const { activeWorkspace, state, dispatch, currentUser } = useWorkspace();
  const now = useNow();
  const today = now ? toISODate(now, activeWorkspace.timeZone) : undefined;
  const project = state.projects.find(({ id }) => id === state.projectFilterId);
  const smartTitle = SMART_VIEWS.find(({ id }) => id === state.smartView)?.label;
  const title = project?.name ?? smartTitle ?? 'پروژه‌ها و وظایف';
  const tasks = filterTasks(state.tasks, {
    smartView: state.smartView,
    projectId: state.projectFilterId,
    search: state.taskSearch,
    currentUserId: currentUser.id,
    ...(today ? { today } : {}),
  });

  return (
    <AppShell
      pageTitle={title}
      sidebar={
        <TaskSidebarContainer
          tasks={state.tasks}
          currentUserId={currentUser.id}
          {...(today ? { today } : {})}
        />
      }
      mobileShowsDetail
    >
      <TaskWorkspace
        title={title}
        scope="legacy"
        boardProjectId={project?.id ?? null}
        search={state.taskSearch}
        onSearch={(query) => dispatch({ type: 'set-task-search', query })}
        tasks={tasks}
        view={state.taskView}
        onViewChange={(view) => dispatch({ type: 'set-task-view', view })}
        navigation={
          <div className="lg:hidden">
            <SectionBackLink href={workspaceRoutes.projects}>پروژه‌ها</SectionBackLink>
          </div>
        }
        smartFilter={{
          value: state.smartView,
          options: LEGACY_FILTERS,
          onChange: (view) => {
            if (view !== 'overdue') dispatch({ type: 'set-smart-view', view });
          },
        }}
      />
    </AppShell>
  );
}

export function MyTasksPage() {
  const { activeWorkspace } = useWorkspace();
  return <ScopedTasks key={activeWorkspace.id} />;
}

export function ProjectTasksPage({ projectId }: { readonly projectId: string }) {
  const { activeWorkspace } = useWorkspace();
  return <ScopedTasks key={`${activeWorkspace.id}:${projectId}`} projectId={projectId} />;
}

function ScopedTasks({ projectId }: { readonly projectId?: string }) {
  const { activeWorkspace, state, dispatch, currentUser } = useWorkspace();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TaskScopeFilter>('all');
  const now = useNow();
  const today = now ? toISODate(now, activeWorkspace.timeZone) : undefined;
  const project = projectId ? state.projects.find(({ id }) => id === projectId) : undefined;
  const projectsLink = <SectionBackLink href={workspaceRoutes.projects}>پروژه‌ها</SectionBackLink>;

  if (projectId && !project) {
    return (
      <AppShell pageTitle="پروژه‌ها">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 scrollbar-thin">
          {projectsLink}
          <EmptyState
            icon={<FolderIcon size={28} />}
            title="پروژه یافت نشد"
            description="پروژه‌های فضای کاری فعال را بررسی کنید."
          />
        </div>
      </AppShell>
    );
  }

  const title = project?.name ?? 'کارهای من';
  const tasks = filterTasks(project ? state.tasks : tasksAssignedTo(state.tasks, currentUser.id), {
    smartView: filter,
    projectId: project?.id ?? null,
    search,
    currentUserId: currentUser.id,
    ...(today ? { today } : {}),
  });

  return (
    <AppShell pageTitle={title}>
      <TaskWorkspace
        title={title}
        scope={project ? 'project' : 'personal'}
        boardProjectId={project?.id ?? null}
        search={search}
        onSearch={setSearch}
        tasks={tasks}
        view={state.taskView}
        onViewChange={(view) => dispatch({ type: 'set-task-view', view })}
        navigation={project ? projectsLink : null}
        smartFilter={{
          value: filter,
          options: project ? PROJECT_FILTERS : PERSONAL_FILTERS,
          onChange: setFilter,
        }}
      />
    </AppShell>
  );
}
