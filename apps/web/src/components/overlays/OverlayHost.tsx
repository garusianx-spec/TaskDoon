'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLive, useWorkspace } from '@/store/WorkspaceProvider';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';
import { CreateProjectModal } from '@/components/tasks/CreateProjectModal';
import { ProjectLimitDialog } from '@/components/tasks/ProjectLimitDialog';
import { ProjectDeleteDialog, ProjectTrashModal } from '@/components/tasks/ProjectTrash';
import { GlobalSearchModal } from '@/components/layout/GlobalSearchModal';
import { NewConversationModal } from '@/components/chat/NewConversationModal';
import { CalendarEventModal } from '@/components/calendar/CalendarEventModal';
import { InviteMemberModal } from '@/components/directory/InviteMemberModal';
import { ProfileModal } from '@/components/account/ProfileModal';
import { SecurityModal } from '@/components/account/SecurityModal';
import { WorkingHoursModal } from '@/components/account/WorkingHoursModal';
import { SignOutModal } from '@/components/account/SignOutModal';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal';
import { WorkspaceSettingsModal } from '@/components/workspace/WorkspaceSettingsModal';
import { DeleteWorkspaceModal } from '@/components/workspace/DeleteWorkspaceModal';
import { nextLocalId } from '@/store/ids';
import { userById } from '@/store/selectors';
import { useOverlays } from './context';

/**
 * Renders every app-level dialog exactly once, at the root, bound to the global overlay
 * store. Each dialog stays presentational: this is the one place that translates their
 * callbacks into reducer actions and route changes.
 */
export function OverlayHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { state, dispatch, currentUser, activeWorkspace, isWorkspaceOwner } = useWorkspace();
  const { active, open, close } = useOverlays();
  const live = useLive();
  const hasPassword = live?.status.user?.hasPassword ?? false;

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

  const deletingProject = active?.kind === 'project-delete' ? (state.projects.find((project) => project.id === active.projectId) ?? null) : null;

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
        onCreateProject={() => open({ kind: 'project-composer' })}
        onClose={close}
        onSubmit={(draft) => {
          dispatch({ type: 'create-task', draft, authorId: currentUser.id });
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
        onClose={close}
        onSubmit={(draft) => {
          const projectId = nextLocalId('project');
          dispatch({ type: 'create-project', projectId, draft, ownerId: currentUser.id });
          close();
          goTo('/tasks');
        }}
      />

      <ProjectDeleteDialog
        project={isWorkspaceOwner ? deletingProject : null}
        onClose={close}
        onConfirm={() => {
          if (deletingProject) dispatch({ type: 'delete-project', projectId: deletingProject.id });
          close();
        }}
      />

      <ProjectTrashModal
        open={isWorkspaceOwner && active?.kind === 'project-trash'}
        entries={state.projectTrash}
        onClose={close}
        onRestore={(projectId) => dispatch({ type: 'restore-project', projectId })}
      />

      <NewConversationModal
        open={active?.kind === 'conversation-composer'}
        currentUserId={currentUser.id}
        conversations={state.conversations}
        onClose={close}
        onSubmit={(draft) => {
          dispatch({ type: 'create-conversation', draft, authorId: currentUser.id });
          close();
          goTo('/chats');
        }}
      />

      <CalendarEventModal
        open={active?.kind === 'event-composer'}
        initialDate={active?.kind === 'event-composer' ? active.date : null}
        currentUserId={currentUser.id}
        onClose={close}
        onSubmit={(draft) => {
          dispatch({ type: 'create-calendar-event', draft });
          close();
          goTo('/calendar');
        }}
      />

      <InviteMemberModal
        open={active?.kind === 'invite-member'}
        invitations={state.invitations}
        onClose={close}
        onRevoke={(invitationId) => dispatch({ type: 'revoke-invitation', invitationId })}
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
        onSave={(profile) => {
          dispatch({ type: 'update-profile', profile });
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
        {...(live ? { live: { hasPassword, onChangePassword: (current, next) => live.store.changePassword(current, next) } } : {})}
      />

      <WorkingHoursModal
        open={active?.kind === 'working-hours'}
        hours={state.workingHours}
        onClose={close}
        onSave={(hours) => {
          dispatch({ type: 'update-working-hours', hours });
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
