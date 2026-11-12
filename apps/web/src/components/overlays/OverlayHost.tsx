'use client';

import { useEffect, useState } from 'react';
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
import { IconButton } from '@/components/ui';
import { CheckCircleIcon, CloseIcon } from '@/components/icons';

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
    currentUser,
    activeWorkspace,
    isWorkspaceOwner,
  } = useWorkspace();
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!taskNotice) return;
    const timer = setTimeout(() => setTaskNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [taskNotice]);
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
        {...(pathname.startsWith('/tasks') && state.projectFilterId
          ? { fixedProjectId: state.projectFilterId }
          : {})}
        onCreateProject={() => open({ kind: 'project-composer' })}
        onClose={close}
        onSubmit={async (draft, files, commandId) => {
          await createTask(draft, files, commandId);
          close();
          setTaskNotice(`وظیفه «${draft.title}» با موفقیت ایجاد شد.`);
        }}
      />

      {taskNotice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-toast flex justify-center px-4 sm:bottom-6">
          <div
            role="status"
            className="pointer-events-auto flex max-w-lg items-start gap-2.5 rounded-xl border border-secondary bg-surface p-3 shadow-lg"
          >
            <CheckCircleIcon size={20} className="mt-0.5 shrink-0 text-status-done" />
            <p className="min-w-0 flex-1 break-words text-body-sm text-fg-primary">{taskNotice}</p>
            <IconButton
              label="بستن پیام موفقیت"
              icon={<CloseIcon size={16} />}
              size="xs"
              onClick={() => setTaskNotice(null)}
            />
          </div>
        </div>
      )}

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
          await createProject(draft, commandId);
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
          setTaskNotice('پروفایل شما به‌روزرسانی شد.');
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
