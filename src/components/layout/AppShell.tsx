'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { TaskDraft } from '@/types';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { conversationById, taskById } from '@/store/selectors';
import { NavRail } from './NavRail';
import { TopAppBar } from './TopAppBar';
import { BottomNav } from './BottomNav';
import { GlobalSearchModal } from './GlobalSearchModal';
import { Drawer } from '@/components/ui';
import { TaskInspector } from '@/components/tasks/TaskInspector';
import { ConversationInspector } from '@/components/chat/ConversationInspector';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';
import { EditProfileModal } from '@/components/account/EditProfileModal';
import { SecurityModal } from '@/components/account/SecurityModal';
import { SignedOutView } from '@/components/account/SignedOutView';

interface ShellActions {
  /** Opens the task composer. Pass a draft to pre-fill it (e.g. from a chat message). */
  readonly openTaskComposer: (draft: TaskDraft | null) => void;
  readonly openGlobalSearch: () => void;
  readonly openProfile: () => void;
  readonly openSecurity: () => void;
}

const ShellActionsContext = createContext<ShellActions | null>(null);

/** Available to every descendant of `AppShell` without prop-drilling through the pages. */
export function useShellActions(): ShellActions {
  const actions = useContext(ShellActionsContext);
  if (!actions) throw new Error('useShellActions must be used inside <AppShell>.');
  return actions;
}

export interface AppShellProps {
  /** Contextual sidebar for the active module; `null` on modules that have none. */
  readonly sidebar?: ReactNode;
  readonly children: ReactNode;
  /**
   * Mobile only. While false the sidebar fills the screen (list view); while true the main
   * area takes over (detail view). Desktop always shows both columns.
   */
  readonly mobileShowsDetail?: boolean;
}

/**
 * Three-column desktop shell (rail، sidebar، workspace) with the inspector docking as a
 * fourth column, collapsing to a top bar + bottom tabs below `lg`.
 *
 * The shell owns the cross-module overlays — task composer, global search and the inspector —
 * because each of them can be opened from more than one module.
 */
export function AppShell({ sidebar, children, mobileShowsDetail = false }: AppShellProps) {
  const { state, dispatch, currentUser, conversations, projects, sessions, isPinned, isMuted } =
    useWorkspace();
  const [composerDraft, setComposerDraft] = useState<TaskDraft | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  const inspectorTask =
    state.inspector.kind === 'task' ? taskById(state.tasks, state.inspector.taskId) : undefined;
  const inspectorConversation =
    state.inspector.kind === 'conversation'
      ? conversationById(conversations, state.inspector.conversationId)
      : undefined;
  const inspectorOpen = Boolean(inspectorTask ?? inspectorConversation);

  const openTaskComposer = useCallback((draft: TaskDraft | null) => {
    setComposerDraft(draft);
    setComposerOpen(true);
  }, []);

  const actions = useMemo<ShellActions>(
    () => ({
      openTaskComposer,
      openGlobalSearch: () => setSearchOpen(true),
      openProfile: () => setProfileOpen(true),
      openSecurity: () => setSecurityOpen(true),
    }),
    [openTaskComposer],
  );

  const closeInspector = useCallback(() => dispatch({ type: 'close-inspector' }), [dispatch]);

  // Signing out tears down the whole workspace surface, not just the popover.
  if (!state.signedIn) {
    return (
      <SignedOutView
        fullName={currentUser.fullName}
        onSignIn={() => dispatch({ type: 'sign-in' })}
      />
    );
  }

  return (
    <ShellActionsContext.Provider value={actions}>
      <div className="flex h-dvh w-full overflow-hidden bg-canvas">
        <a href="#workspace-main" className="focusable-sr-only">
          پرش به محتوای اصلی
        </a>

        <NavRail />

        <div className="flex min-w-0 flex-1 lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TopAppBar onSearch={() => setSearchOpen(true)} />

            <div className="flex min-h-0 flex-1">
              {sidebar ? (
                <aside
                  aria-label="ستون زمینه"
                  className={[
                    'min-h-0 shrink-0 flex-col border-s border-secondary bg-surface lg:flex lg:w-sidebar',
                    mobileShowsDetail ? 'hidden lg:flex' : 'flex w-full',
                  ].join(' ')}
                >
                  {sidebar}
                </aside>
              ) : null}

              <main
                id="workspace-main"
                className={[
                  'min-h-0 min-w-0 flex-1 flex-col',
                  sidebar && !mobileShowsDetail ? 'hidden lg:flex' : 'flex',
                ].join(' ')}
              >
                {children}
              </main>
            </div>

            <BottomNav />
          </div>

          <Drawer
            open={inspectorOpen}
            onClose={closeInspector}
            title={inspectorTask ? 'جزئیات وظیفه' : 'جزئیات گفتگو'}
            className="border-s border-secondary"
          >
            {inspectorTask && (
              <TaskInspector
                task={inspectorTask}
                projects={projects}
                currentUser={currentUser}
                onClose={closeInspector}
                onPatch={(patch) => dispatch({ type: 'patch-task', taskId: inspectorTask.id, patch })}
                onToggleStar={() => dispatch({ type: 'toggle-task-star', taskId: inspectorTask.id })}
                onToggleSubtask={(subtaskId) =>
                  dispatch({ type: 'toggle-subtask', taskId: inspectorTask.id, subtaskId })
                }
                onAddSubtask={(title) => dispatch({ type: 'add-subtask', taskId: inspectorTask.id, title })}
                onRemoveSubtask={(subtaskId) =>
                  dispatch({ type: 'remove-subtask', taskId: inspectorTask.id, subtaskId })
                }
                onMoveSubtask={(subtaskId, delta) =>
                  dispatch({ type: 'move-subtask', taskId: inspectorTask.id, subtaskId, delta })
                }
                onAddComment={(body, replyToId) =>
                  dispatch({
                    type: 'add-task-comment',
                    taskId: inspectorTask.id,
                    authorId: currentUser.id,
                    body,
                    replyToId,
                  })
                }
                onReminderChange={(reminder) =>
                  dispatch({ type: 'set-task-reminder', taskId: inspectorTask.id, reminder })
                }
                onRecurrenceChange={(recurrence) =>
                  dispatch({ type: 'set-task-recurrence', taskId: inspectorTask.id, recurrence })
                }
              />
            )}

            {inspectorConversation && (
              <ConversationInspector
                conversation={inspectorConversation}
                messages={state.messages}
                pinned={isPinned(inspectorConversation.id)}
                muted={isMuted(inspectorConversation.id)}
                onTogglePin={() =>
                  dispatch({ type: 'toggle-conversation-pin', conversationId: inspectorConversation.id })
                }
                onToggleMute={() =>
                  dispatch({ type: 'toggle-conversation-mute', conversationId: inspectorConversation.id })
                }
                onClose={closeInspector}
                projectName={
                  inspectorConversation.projectId
                    ? (projects.find((p) => p.id === inspectorConversation.projectId)?.name ?? null)
                    : null
                }
                onOpenProjectBoard={
                  inspectorConversation.projectId
                    ? () => {
                        dispatch({
                          type: 'set-project-filter',
                          projectId: inspectorConversation.projectId,
                        });
                        closeInspector();
                        router.push('/tasks');
                      }
                    : null
                }
              />
            )}
          </Drawer>
        </div>

        <CreateTaskModal
          open={composerOpen}
          draft={composerDraft}
          onClose={() => setComposerOpen(false)}
          onSubmit={(draft) => {
            dispatch({ type: 'create-task', draft, authorId: currentUser.id });
            setComposerOpen(false);
            setComposerDraft(null);
          }}
        />

        <EditProfileModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          user={currentUser}
          onSave={(profile) => dispatch({ type: 'update-profile', profile })}
        />

        <SecurityModal
          open={securityOpen}
          onClose={() => setSecurityOpen(false)}
          sessions={sessions}
          onRevokeSession={(sessionId) => dispatch({ type: 'revoke-session', sessionId })}
          onChangePassword={() =>
            dispatch({ type: 'announce', message: 'رمز عبور با موفقیت تغییر کرد.' })
          }
        />

        <GlobalSearchModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          tasks={state.tasks}
          messages={state.messages}
          onOpenTask={(taskId) => {
            dispatch({ type: 'open-task', taskId });
            setSearchOpen(false);
          }}
          onOpenConversation={(conversationId) => {
            dispatch({ type: 'select-conversation', conversationId });
            setSearchOpen(false);
          }}
        />

        {/* Single live region for non-visual state changes (board moves, task creation). */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {state.announcement}
        </div>
      </div>
    </ShellActionsContext.Provider>
  );
}
