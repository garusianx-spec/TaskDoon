'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLive, useWorkspace } from '@/store/WorkspaceProvider';
import { conversationById, filterConversations, userById } from '@/store/selectors';
import { directory } from '@/store/directory';
import { nextLocalId } from '@/store/ids';
import { api } from '@/api/endpoints';
import { problemMessage } from '@/api/messages';
import { AppShell } from '@/components/layout/AppShell';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatView } from '@/components/chat/ChatView';
import { Button, EmptyState, Input, Modal } from '@/components/ui';
import { MessagesIcon } from '@/components/icons';

export default function ChatsPage() {
  return (
    <ChatsShell />
  );
}

function ChatsShell() {
  const { state, dispatch, currentUser, conversations, unreadFor, isPinned, totalUnread } = useWorkspace();
  const { open } = useOverlays();
  // Mobile: the sidebar is the list screen until a conversation is opened.
  const [mobileDetail, setMobileDetail] = useState(false);
  const live = useLive();
  const [archive, setArchive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ readonly id: string; readonly title: string; readonly workspaceId: string } | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  const visible = useMemo(
    () =>
      filterConversations(conversations.filter(item => Boolean(item.archived) === archive), state.messages, {
        filter: state.chatFilter,
        search: state.chatSearch,
        unreadByConversation: state.unreadByConversation,
        pinnedIds: state.pinnedConversationIds,
      }),
    [conversations, archive, state.messages, state.chatFilter, state.chatSearch, state.unreadByConversation, state.pinnedConversationIds],
  );

  const active = conversations.find(item => item.id === state.activeConversationId && Boolean(item.archived) === archive);
  const defaultProjectId = directory.projects()[0]?.id ?? '';
  const canDelete = active?.archiveManager || state.workspaces.find(item => item.id === state.activeWorkspaceId)?.ownerId === currentUser.id;
  const deleteArchived = async () => {
    const target = deleteTarget;
    if (!target || deleting) return;
    if (confirmTitle !== target.title) { setError('نام گفتگو را دقیق وارد کنید.'); return; }
    setDeleting(true);
    try {
      if (live) await api.conversations.deleteArchived(target.workspaceId, target.id, confirmTitle);
      dispatch({ type: 'sync/remove-conversation', conversationId: target.id });
      setDeleteTarget(null);
    } catch (error) {
      setError(problemMessage(error));
    } finally {
      setDeleting(false);
    }
  };


  return (
    <AppShell
      mobileShowsDetail={mobileDetail}
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
        <div role="group" className="flex gap-2 border-b border-secondary p-3" aria-label="بخش گفتگوها">
          <Button size="sm" className="min-h-11" variant={archive ? 'secondary' : 'primary'} aria-pressed={!archive} onClick={() => setArchive(false)}>گفتگوهای فعال</Button>
          <Button size="sm" className="min-h-11" variant={archive ? 'primary' : 'secondary'} aria-pressed={archive} onClick={() => setArchive(true)}>بایگانی</Button>
        </div>
        {archive && active && canDelete && (
          <div className="border-b border-secondary p-3">
            <Button variant="destructive" size="sm" className="min-h-11" onClick={() => { setDeleteTarget({ id: active.id, title: active.title, workspaceId: state.activeWorkspaceId }); setConfirmTitle(''); setError(undefined); }}>
              حذف دائمی گفتگوی بایگانی‌شده
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1"><ChatSidebar
          conversations={visible}
          messages={state.messages}
          activeConversationId={state.activeConversationId}
          filter={state.chatFilter}
          search={state.chatSearch}
          unreadFor={unreadFor}
          isPinned={isPinned}
          unreadTotal={totalUnread}
          onFilterChange={(filter) => dispatch({ type: 'set-chat-filter', filter })}
          onSearchChange={(query) => dispatch({ type: 'set-chat-search', query })}
          onTogglePin={(conversationId) => dispatch({ type: 'toggle-conversation-pin', conversationId })}
          onNewConversation={() => open({ kind: 'conversation-composer' })}
          onSelect={(conversationId) => {
            dispatch({ type: 'select-conversation', conversationId });
            setMobileDetail(true);
          }}
        /></div>
        <Modal
          open={deleteTarget !== null}
          onClose={() => { if (!deleting) setDeleteTarget(null); }}
          title="حذف دائمی گفتگوی بایگانی‌شده"
          description={deleteTarget ? `گفتگوی «${deleteTarget.title}» و تاریخچه آن برای همیشه حذف می‌شود.` : ''}
          dismissOnOverlayClick={false}
          footer={<>
            <Button data-autofocus variant="secondary" className="min-h-11" disabled={deleting} onClick={() => setDeleteTarget(null)}>انصراف</Button>
            <Button variant="destructive" className="min-h-11" loading={deleting} onClick={deleteArchived}>حذف دائمی</Button>
          </>}
        >
          <Input
            label="نام گفتگو برای تأیید"
            value={confirmTitle}
            onChange={event => { setConfirmTitle(event.target.value); setError(undefined); }}
            onFocus={() => setError(undefined)}
            onBlur={() => { if (deleteTarget && confirmTitle !== deleteTarget.title) setError('نام گفتگو را دقیق وارد کنید.'); }}
            error={error}
            disabled={deleting}
          />
        </Modal>
        </div>
      }
    >
      {active ? (
        <ChatContent
          onBack={() => setMobileDetail(false)}
          defaultProjectId={defaultProjectId}
          currentUserId={currentUser.id}
        />
      ) : (
        <EmptyState
          icon={<MessagesIcon size={26} />}
          title="گفتگویی انتخاب نشده است"
          description="از ستون کناری یک گفتگو را انتخاب کنید تا پیام‌ها نمایش داده شوند."
        />
      )}
    </AppShell>
  );
}

interface ChatContentProps {
  readonly onBack: () => void;
  readonly defaultProjectId: string;
  readonly currentUserId: string;
}

/** Split out so the composer hook resolves inside the `AppShell` provider. */
function ChatContent({ onBack, defaultProjectId, currentUserId }: ChatContentProps) {
  const { state, dispatch } = useWorkspace();
  const live = useLive();
  const clearFocus = useCallback(() => dispatch({ type: 'clear-message-focus' }), [dispatch]);
  const { openTaskComposer } = useOverlays();
  const conversation = conversationById(state.conversations, state.activeConversationId);

  if (!conversation) return null;

  return (
    <ChatView
      conversation={conversation}
      messages={state.messages}
      currentUserId={currentUserId}
      defaultProjectId={defaultProjectId}
      onBack={onBack}
      onSend={(text, replyToId) =>
        dispatch({
          type: 'send-message',
          conversationId: conversation.id,
          authorId: currentUserId,
          text,
          replyToId,
        })
      }
      onToggleReaction={(messageId, emoji) =>
        dispatch({ type: 'toggle-reaction', messageId, emoji, userId: currentUserId })
      }
      onConvertToTask={(draft) => openTaskComposer(draft)}
      onOpenTask={(taskId) => dispatch({ type: 'open-task', taskId })}
      onOpenDetails={() =>
        dispatch({ type: 'open-conversation-details', conversationId: conversation.id })
      }
      typingNames={(state.typingByConversation[conversation.id] ?? []).map((userId) => userById(userId)?.fullName ?? 'کسی')}
      onAttach={(items) => {
        for (const { file, caption, asFile } of items) {
          dispatch({
            type: 'send-file',
            conversationId: conversation.id,
            authorId: currentUserId,
            messageId: nextLocalId('m'),
            picked: { attachmentId: nextLocalId('att'), file, name: file.name, previewUrl: URL.createObjectURL(file) },
            caption,
            replyToId: null,
            ...(asFile ? { asFile } : {}),
          });
        }
      }}
      onResend={(messageId) => dispatch({ type: 'resend-message', messageId })}
      onDiscard={(messageId) => dispatch({ type: 'discard-message', messageId })}
      onVoice={(recorded) =>
        dispatch({
          type: 'send-voice',
          conversationId: conversation.id,
          authorId: currentUserId,
          messageId: nextLocalId('m'),
          recording: { ...recorded, previewUrl: URL.createObjectURL(recorded.blob) },
        })
      }
      focusedMessageId={state.focusedMessageId}
      onFocusShown={clearFocus}
      scheduled={state.scheduledMessages.filter((entry) => entry.conversationId === conversation.id && entry.authorId === currentUserId)}
      onSchedule={(text, replyToId, at) =>
        dispatch({
          type: 'schedule-message',
          scheduledId: nextLocalId('sched'),
          conversationId: conversation.id,
          authorId: currentUserId,
          text,
          replyToId,
          scheduledAt: at.toISOString(),
        })
      }
      onSendScheduledNow={(scheduledId) => dispatch({ type: 'send-scheduled-now', scheduledId, messageId: nextLocalId('m') })}
      onCancelScheduled={(scheduledId) => dispatch({ type: 'cancel-scheduled-message', scheduledId })}
      {...(live ? { onTyping: (active: boolean) => live.store.typing(conversation.id, active) } : {})}
    />
  );
}
