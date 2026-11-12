'use client';

import type { Task } from '@taskin/contracts';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { TaskSidebar } from '@/features/board/components/TaskSidebar';

export function TaskSidebarContainer({
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
