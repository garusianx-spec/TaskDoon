'use client';

import { useMemo,useState } from 'react';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { filterTasks } from '@/store/selectors';
import { AppShell } from '@/components/layout/AppShell';
import { TaskSidebarContainer } from '@/features/board/components/TaskSidebarContainer';
import { TaskWorkspace } from '@/features/board/components/TaskWorkspace';

export function TasksPage() {
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
