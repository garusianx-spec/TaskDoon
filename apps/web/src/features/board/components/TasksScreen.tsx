'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { TaskViewMode } from '@taskin/contracts';
import { TEHRAN_TIME_ZONE, toISODate } from '@taskin/jalali';
import { useNow } from '@/hooks/useNow';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { filterTasks } from '@/store/selectors';
import { AppShell } from '@/components/layout/AppShell';
import { TaskSidebarContainer } from '@/features/board/components/TaskSidebarContainer';
import { TaskWorkspace } from '@/features/board/components/TaskWorkspace';
import { parseTaskViewParam, taskViewHref } from '@/features/board/lib/task-view';

function TasksScreenContent() {
  const { state, dispatch, currentUser, activeWorkspace } = useWorkspace();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow();
  const today = now ? toISODate(now, activeWorkspace.timeZone ?? TEHRAN_TIME_ZONE) : undefined;
  // Mobile only: the contextual sidebar is a togglable panel rather than the tab body,
  // so the task list itself is what the "وظایف من" tab opens on.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const urlView = parseTaskViewParam(searchParams.get('view'));
  const [bootUrlView, setBootUrlView] = useState<TaskViewMode | null>(() => urlView);
  const initializedRef = useRef(false);
  const pendingUrlViewRef = useRef<TaskViewMode | null | undefined>(undefined);
  const activeView = bootUrlView ?? state.taskView;

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (urlView !== null) {
        if (urlView !== state.taskView) dispatch({ type: 'set-task-view', view: urlView });
        return;
      }
      if (state.taskView !== 'board' && typeof window !== 'undefined') {
        pendingUrlViewRef.current = state.taskView;
        window.history.replaceState(
          window.history.state,
          '',
          taskViewHref(pathname, new URLSearchParams(window.location.search), state.taskView),
        );
      }
      return;
    }

    if (pendingUrlViewRef.current !== undefined) {
      if (urlView === pendingUrlViewRef.current) pendingUrlViewRef.current = undefined;
      return;
    }

    if (urlView !== null && urlView !== state.taskView) {
      dispatch({ type: 'set-task-view', view: urlView });
    }
  }, [urlView, state.taskView, dispatch, pathname]);

  const handleViewChange = useCallback(
    (view: TaskViewMode) => {
      setBootUrlView(null);
      pendingUrlViewRef.current = view === 'board' ? null : view;
      dispatch({ type: 'set-task-view', view });
      if (typeof window !== 'undefined') {
        window.history.replaceState(
          window.history.state,
          '',
          taskViewHref(pathname, new URLSearchParams(window.location.search), view),
        );
      }
    },
    [dispatch, pathname],
  );

  const tasks = useMemo(
    () =>
      filterTasks(state.tasks, {
        smartView: state.smartView,
        projectId: state.projectFilterId,
        search: state.taskSearch,
        currentUserId: currentUser.id,
        today,
      }),
    [state.tasks, state.smartView, state.projectFilterId, state.taskSearch, currentUser.id, today],
  );

  return (
    <AppShell
      sidebar={
        <TaskSidebarContainer
          tasks={state.tasks}
          currentUserId={currentUser.id}
          today={today}
          onNavigate={() => setMobileFiltersOpen(false)}
        />
      }
      mobileShowsDetail={!mobileFiltersOpen}
    >
      <TaskWorkspace
        tasks={tasks}
        view={activeView}
        onViewChange={handleViewChange}
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
      />
    </AppShell>
  );
}

export function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksScreenContent />
    </Suspense>
  );
}
