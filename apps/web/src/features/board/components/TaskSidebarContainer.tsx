'use client';

import type { Task } from '@taskin/contracts';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { TaskSidebar } from '@/features/board/components/TaskSidebar';

export function TaskSidebarContainer({
  tasks,
  currentUserId,
  today,
}: {
  readonly tasks: readonly Task[];
  readonly currentUserId: string;
  readonly today?: string;
}) {
  const { state, dispatch, isWorkspaceOwner } = useWorkspace();
  const { open } = useOverlays();

  return (
    <TaskSidebar
      tasks={tasks}
      smartView={state.smartView}
      projectFilterId={state.projectFilterId}
      currentUserId={currentUserId}
      {...(today ? { today } : {})}
      onSmartViewChange={(view) => dispatch({ type: 'set-smart-view', view })}
      onProjectChange={(projectId) => dispatch({ type: 'set-project-filter', projectId })}
      onCreateProject={() => open({ kind: 'project-composer' })}
      // Deleting (to the trash) and restoring projects are the workspace owner's alone.
      {...(isWorkspaceOwner
        ? {
            onDeleteProject: (projectId: string) => open({ kind: 'project-delete', projectId }),
            onOpenTrash: () => open({ kind: 'project-trash' }),
          }
        : {})}
    />
  );
}
