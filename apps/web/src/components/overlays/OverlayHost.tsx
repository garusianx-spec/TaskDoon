'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLive, useWorkspace } from '@/store/WorkspaceProvider';
import { CreateTaskModal } from '@/features/tasks/components/CreateTaskModal';
import { CreateProjectModal } from '@/features/board/components/CreateProjectModal';
import { ProjectLimitDialog } from '@/features/board/components/ProjectLimitDialog';
import { ProjectDeleteDialog, ProjectTrashModal } from '@/features/board/components/ProjectTrash';
import { GlobalSearchModal } from '@/components/layout/GlobalSearchModal';
import { NewConversationModal } from '@/features/chat/components/NewConversationModal';
import { CalendarEventModal } from '@/features/calendar/components/CalendarEventModal';
import { InviteMemberModal } from '@/features/workspace/components/directory/InviteMemberModal';
import { ProfileModal } from '@/features/account/components/ProfileModal';
import { SecurityModal } from '@/features/account/components/SecurityModal';
import { WorkingHoursModal } from '@/features/account/components/WorkingHoursModal';
import { SignOutModal } from '@/features/account/components/SignOutModal';
import { NotificationCenter } from '@/features/notifications/components/NotificationCenter';
import { CreateWorkspaceModal } from '@/features/workspace/components/CreateWorkspaceModal';
import { WorkspaceSettingsModal } from '@/features/workspace/components/WorkspaceSettingsModal';
import { DeleteWorkspaceModal } from '@/features/workspace/components/DeleteWorkspaceModal';
import { nextLocalId } from '@/store/ids';
import { userById } from '@/store/selectors';
import { useOverlays } from '@/components/overlays/context';
import { isRoute, projectHref, workspaceRoutes } from '@/lib/workspace-navigation';

/**
 * Renders every app-level dialog exactly once, at the root, bound to the global overlay
 * store. Each dialog stays presentational: this is the one place that translates their
 * callbacks into reducer actions and route changes.
 */
export function OverlayHost() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    state,
    dispatch,
    createTask,
    createProject,
    saveProfile,
    confirmOperation,
    currentUser,
    activeWorkspace,
    isWorkspaceOwner,
  } = useWorkspace();
  const { active, open, close } = useOverlays();
  const live = useLive();
  const liveStore = live?.store;
  const loadTrash = useCallback(async () => {
    await liveStore?.loadProjectTrash();
  }, [liveStore]);
  const hasPassword = live?.status.user?.hasPassword ?? false;
  const memberPermissions = state.permissions[currentUser.role].members;

  const goTo = (href: string) => {
    if (!pathname.startsWith(href)) router.push(href);
  };

  const openConversation = (conversationId: string) => {
    dispatch({ type: 'select-conversation', conversationId });
    goTo('/chats');
  };

  // Every «پروژه جدید» (the project tree's +, quick create, the task composer) comes through
  // here: at the plan's limit the member is told so, and the form never opens.
  const projectLimit = activeWorkspace.projectLimit ?? null;
  const atProjectLimit = projectLimit !== null && state.projects.length >= projectLimit;
  const fixedProjectId =
    pathname === '/tasks'
      ? state.projectFilterId
      : state.projects.find((project) => projectHref(project.id) === pathname)?.id;

  const deletingProject =
    active?.kind === 'project-delete'
      ? (state.projects.find((project) => project.id === active.projectId) ?? null)
      : null;

  const pendingDeletion =
    active?.kind === 'workspace-delete'
      ? (state.workspaces.find((workspace) => workspace.id === active.workspaceId) ?? null)
      : null;

  return (
    <>
      <CreateTaskModal
        open={active?.kind === 'task-composer'}
        draft={active?.kind === 'task-composer' ? active.draft : null}
        columns={state.boardColumns}
        timeZone={activeWorkspace.timeZone}
        {...(fixedProjectId ? { fixedProjectId } : {})}
        onCreateProject={() => open({ kind: 'project-composer' })}
        onClose={close}
        onSubmit={async (draft, files, commandId) => {
          await createTask(draft, files, commandId);
          close();
        }}
      />

      <ProjectLimitDialog
        open={active?.kind === 'project-composer' && atProjectLimit}
        limit={projectLimit ?? 0}
        plan={activeWorkspace.plan}
        onClose={close}
      />

      <CreateProjectModal
        open={active?.kind === 'project-composer' && !atProjectLimit}
        projectCount={state.projects.length}
        departments={state.departments}
        members={state.users}
        currentUserId={currentUser.id}
        canCreateDepartment={isWorkspaceOwner || state.permissions[currentUser.role].members.create}
        onClose={close}
        onSubmit={async (draft, commandId) => {
          const id = await createProject(draft, commandId);
          close();
          if (isRoute(pathname, workspaceRoutes.projects)) goTo(projectHref(id));
          else if (isRoute(pathname, workspaceRoutes.myTasks)) router.push('/tasks');
          else goTo('/tasks');
        }}
      />

      <ProjectDeleteDialog
        project={isWorkspaceOwner ? deletingProject : null}
        onClose={close}
        onConfirm={async () => {
          if (deletingProject)
            await confirmOperation({ type: 'delete-project', projectId: deletingProject.id });
          close();
        }}
      />

      <ProjectTrashModal
        open={isWorkspaceOwner && active?.kind === 'project-trash'}
        entries={state.projectTrash}
        onClose={close}
        {...(liveStore ? { onLoad: loadTrash } : {})}
        onRestore={(projectId) => confirmOperation({ type: 'restore-project', projectId })}
      />

      <NewConversationModal
        open={active?.kind === 'conversation-composer'}
        currentUserId={currentUser.id}
        conversations={state.conversations}
        onClose={close}
        onSubmit={async (draft, commandId) => {
          await confirmOperation({ type: 'create-conversation', draft, authorId: currentUser.id }, commandId);
          close();
          goTo('/chats');
        }}
      />

      <CalendarEventModal
        open={active?.kind === 'event-composer'}
        initialDate={active?.kind === 'event-composer' ? active.date : null}
        currentUserId={currentUser.id}
        onClose={close}
        onSubmit={async (draft, commandId) => {
          await confirmOperation({ type: 'create-calendar-event', draft }, commandId);
          close();
          goTo('/calendar');
        }}
      />

      <InviteMemberModal
        open={active?.kind === 'invite-member' && (isWorkspaceOwner || memberPermissions.create)}
        invitations={isWorkspaceOwner || memberPermissions.view ? state.invitations : []}
        onClose={close}
        {...(isWorkspaceOwner || memberPermissions.delete
          ? { onRevoke: (invitationId: string) => dispatch({ type: 'revoke-invitation', invitationId }) }
          : {})}
        onSubmit={(draft) => {
          dispatch({ type: 'invite-members', draft, invitedById: currentUser.id });
          close();
        }}
      />

      <CreateWorkspaceModal
        open={active?.kind === 'workspace-create'}
        requirePassword={live !== null && !hasPassword}
        onClose={close}
        onSubmit={(draft, adminPassword) => {
          dispatch({
            type: 'create-workspace',
            workspaceId: nextLocalId('ws'),
            draft,
            ownerId: currentUser.id,
            ...(adminPassword ? { adminPassword } : {}),
          });
          close();
          goTo('/feed');
        }}
      />

      <WorkspaceSettingsModal
        open={active?.kind === 'workspace-settings'}
        workspace={activeWorkspace}
        owner={userById(activeWorkspace.ownerId)}
        isOwner={isWorkspaceOwner}
        isLastWorkspace={state.workspaces.length <= 1}
        onClose={close}
        onRequestDelete={() => open({ kind: 'workspace-delete', workspaceId: activeWorkspace.id })}
        {...(live && (isWorkspaceOwner || state.permissions[currentUser.role]?.members.edit)
          ? { onSaveIcon: (file: File | null) => live.store.saveWorkspaceIcon(activeWorkspace.id, file) }
          : {})}
      />

      <DeleteWorkspaceModal
        workspace={pendingDeletion}
        requirePassword={live !== null}
        onClose={() => open({ kind: 'workspace-settings' })}
        onConfirm={(password) => {
          if (!pendingDeletion) return;
          dispatch({
            type: 'delete-workspace',
            workspaceId: pendingDeletion.id,
            actorId: currentUser.id,
            ...(password ? { password } : {}),
          });
          close();
          goTo('/feed');
        }}
      />

      <ProfileModal
        open={active?.kind === 'profile'}
        user={currentUser}
        profile={state.profile}
        onClose={close}
        onOpenSecurity={() => open({ kind: 'security' })}
        onSave={async (fullName, profile) => {
          await saveProfile(fullName, profile);
          close();
        }}
      />

      <SecurityModal
        open={active?.kind === 'security'}
        user={currentUser}
        twoFactorEnabled={state.twoFactorEnabled}
        passwordChangedAt={state.passwordChangedAt}
        sessions={state.loginSessions}
        onClose={close}
        onPasswordChanged={() => dispatch({ type: 'record-password-change' })}
        onToggleTwoFactor={(enabled) => dispatch({ type: 'set-two-factor', enabled })}
        onRevokeSession={(sessionId) => dispatch({ type: 'revoke-login-session', sessionId })}
        onRevokeOtherSessions={() => dispatch({ type: 'revoke-other-login-sessions' })}
        {...(live
          ? {
              live: {
                hasPassword,
                onChangePassword: (current, next) => live.store.changePassword(current, next),
              },
            }
          : {})}
      />

      <WorkingHoursModal
        open={active?.kind === 'working-hours'}
        hours={state.workingHours}
        onClose={close}
        onSave={async (hours) => {
          await confirmOperation({ type: 'update-working-hours', hours });
          close();
        }}
      />

      <SignOutModal
        open={active?.kind === 'sign-out'}
        fullName={currentUser.fullName}
        onClose={close}
        onConfirm={() => {
          close();
          dispatch({ type: 'sign-out' });
          router.replace('/signed-out');
        }}
      />

      <GlobalSearchModal
        open={active?.kind === 'global-search'}
        onClose={close}
        tasks={state.tasks}
        conversations={state.conversations}
        messages={state.messages}
        onOpenTask={(taskId) => {
          dispatch({ type: 'open-task', taskId });
          close();
        }}
        onOpenConversation={(conversationId) => {
          close();
          openConversation(conversationId);
        }}
      />

      <NotificationCenter
        open={active?.kind === 'notifications'}
        notifications={state.notifications}
        onClose={close}
        onMarkRead={(notificationId) => dispatch({ type: 'mark-notification-read', notificationId })}
        onMarkAllRead={() => dispatch({ type: 'mark-all-notifications-read' })}
        onOpenTarget={(notification) => {
          dispatch({
            type: 'mark-notification-read',
            notificationId: notification.id,
          });
          close();
          if (notification.target.kind === 'task') {
            dispatch({ type: 'open-task', taskId: notification.target.taskId });
          } else {
            openConversation(notification.target.conversationId);
          }
        }}
      />
    </>
  );
}
