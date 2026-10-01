'use client';

import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLive, useWorkspace } from '@/store/WorkspaceProvider';
import { conversationById, messagePreview, projectColumns, taskById, userById } from '@/store/selectors';
import { nextLocalId } from '@/store/ids';
import { NavRail } from './NavRail';
import { TopAppBar } from './TopAppBar';
import { BottomNav } from './BottomNav';
import { Drawer } from '@/components/ui';
import { TaskInspector, type TaskSourceView } from '@/components/tasks/TaskInspector';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { BlockedDoneNotice } from '@/components/tasks/agile/BlockedDoneNotice';
import { ConversationInspector } from '@/components/chat/ConversationInspector';

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
 * Three-column desktop shell (rail، sidebar، workspace) with the conversation details docking
 * as a fourth column, collapsing to a top bar + bottom tabs below `lg`. A task's details open
 * over the workspace in a centred dialog.
 *
 * The inspectors live here because they follow the workspace state's `inspector`. Every other
 * modal dialog — composers, search, notifications, account — lives in the global
 * `OverlayProvider` instead, so it can be opened from anywhere via `useOverlays()`.
 */
export function AppShell({ sidebar, children, mobileShowsDetail = false }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, dispatch, currentUser, isPinned, isMuted } = useWorkspace();
  const signedOut = state.session === 'signed-out';

  useEffect(() => {
    if (signedOut) router.replace('/signed-out');
  }, [signedOut, router]);

  const inspectorTask =
    state.inspector.kind === 'task' ? taskById(state.tasks, state.inspector.taskId) : undefined;
  // Conversation details belong to the chat they describe: they dock on /chats only, and
  // reappear there if they were open when the member left.
  const inspectorConversation =
    state.inspector.kind === 'conversation' && pathname.startsWith('/chats')
      ? conversationById(state.conversations, state.inspector.conversationId)
      : undefined;

  const closeInspector = useCallback(() => dispatch({ type: 'close-inspector' }), [dispatch]);
  // The chat message the inspected task came from: from the loaded history, else as the server described it.
  const sourceMessage = inspectorTask?.sourceMessageId ? state.messages.find((message) => message.id === inspectorTask.sourceMessageId) : undefined;
  const sourceRef = inspectorTask?.sourceMessage;
  const sourceConversationId = sourceMessage?.conversationId ?? sourceRef?.conversationId ?? null;
  const sourceAuthorId = sourceMessage?.authorId ?? sourceRef?.authorId ?? null;
  const taskSource: TaskSourceView | null = inspectorTask?.sourceMessageId
    ? {
        accessible: sourceMessage !== undefined || (sourceRef?.accessible ?? false),
        excerpt: sourceMessage ? messagePreview(sourceMessage) : (sourceRef?.excerpt ?? null),
        authorName: sourceAuthorId ? (userById(sourceAuthorId)?.fullName ?? null) : null,
        conversationTitle: sourceConversationId ? (conversationById(state.conversations, sourceConversationId)?.title ?? null) : null,
        // A deleted message shows as a system line ("این پیام حذف شد.") once history is loaded.
        deleted: (sourceRef?.deleted ?? false) || sourceMessage?.body.kind === 'system',
      }
    : null;
  const live = useLive();
  const liveStore = live?.store ?? null;
  const sharedId = inspectorConversation?.id ?? null;
  const loadShared = useMemo(() => (liveStore && sharedId ? () => liveStore.sharedMedia(sharedId) : undefined), [liveStore, sharedId]);

  if (signedOut) return null;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-canvas">
      <a href="#workspace-main" className="focusable-sr-only">
        پرش به محتوای اصلی
      </a>

      <NavRail />

      <div className="flex min-w-0 flex-1 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopAppBar />

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
          open={inspectorConversation !== undefined}
          onClose={closeInspector}
          title="جزئیات گفتگو"
          className="border-s border-secondary"
        >
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
              {...(loadShared ? { loadShared } : {})}
            />
          )}
        </Drawer>
      </div>

      <TaskDetailDialog open={inspectorTask !== undefined} onClose={closeInspector} title="جزئیات وظیفه">
        {inspectorTask && (
          <TaskInspector
            task={inspectorTask}
            currentUser={currentUser}
            columns={projectColumns(state.boardColumns, inspectorTask.projectId)}
            onClose={closeInspector}
            onPatch={(patch) => dispatch({ type: 'patch-task', taskId: inspectorTask.id, patch })}
            onMoveToColumn={(columnId) =>
              dispatch({ type: 'move-task-to-column', taskId: inspectorTask.id, columnId })
            }
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
            onAttachFiles={(files) =>
              dispatch({
                type: 'attach-task-files',
                taskId: inspectorTask.id,
                authorId: currentUser.id,
                files: files.map((file) => ({ attachmentId: nextLocalId('att'), file, name: file.name, previewUrl: URL.createObjectURL(file) })),
              })
            }
            onRemoveAttachment={(attachmentId) => dispatch({ type: 'remove-task-attachment', taskId: inspectorTask.id, attachmentId })}
            source={taskSource}
            onOpenSource={() => {
              if (!sourceConversationId || !inspectorTask.sourceMessageId) return;
              dispatch({ type: 'focus-message', conversationId: sourceConversationId, messageId: inspectorTask.sourceMessageId });
              if (!pathname.startsWith('/chats')) router.push('/chats');
            }}
          />
        )}
      </TaskDetailDialog>

      {/* Agile tracking: a task reached Done while still blocked (a warning; the move stands). */}
      <BlockedDoneNotice />

      {/* Single live region for non-visual state changes (board moves, task creation). */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {state.announcement}
      </div>
    </div>
  );
}
