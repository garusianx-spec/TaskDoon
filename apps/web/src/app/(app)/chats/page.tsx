'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLive, useWorkspace } from '@/store/WorkspaceProvider';
import { conversationById, filterConversations, userById } from '@/store/selectors';
import { directory } from '@/store/directory';
import { nextLocalId } from '@/store/ids';
import { AppShell } from '@/components/layout/AppShell';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatView } from '@/components/chat/ChatView';
import { EmptyState } from '@/components/ui';
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

  const visible = useMemo(
    () =>
      filterConversations(conversations, state.messages, {
        filter: state.chatFilter,
        search: state.chatSearch,
        unreadByConversation: state.unreadByConversation,
        pinnedIds: state.pinnedConversationIds,
      }),
    [conversations, state.messages, state.chatFilter, state.chatSearch, state.unreadByConversation, state.pinnedConversationIds],
  );

  const active = conversationById(conversations, state.activeConversationId);
  const defaultProjectId = directory.projects()[0]?.id ?? '';

  return (
    <AppShell
      mobileShowsDetail={mobileDetail}
      sidebar={
        <ChatSidebar
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
        />
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
