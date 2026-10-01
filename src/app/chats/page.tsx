'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { conversationById, filterConversations } from '@/store/selectors';
import { canForwardMessages, canManagePins } from '@/lib/permissions';
import { PROJECTS } from '@/data/workspace';
import { AppShell, useShellActions } from '@/components/layout/AppShell';
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
  // Mobile: the sidebar is the list screen until a conversation is opened. Arriving from
  // another module (e.g. "ارسال پیام" in the directory) already picked a thread, so open
  // straight onto it rather than dropping the user back on the list.
  const [mobileDetail, setMobileDetail] = useState(state.focusComposer);

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
  const defaultProjectId = PROJECTS[0]?.id ?? '';

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
  const { state, dispatch, currentUser } = useWorkspace();
  const { openTaskComposer } = useShellActions();
  const router = useRouter();
  const conversation = conversationById(state.conversations, state.activeConversationId);

  // Pin/forward rights come from the live RBAC matrix, so revoking them on the settings
  // screen hides these actions immediately.
  const canPin = canManagePins(currentUser, state.permissions);
  const canForward = canForwardMessages(currentUser, state.permissions);

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
      canPin={canPin}
      canForward={canForward}
      onTogglePin={(messageId) => dispatch({ type: 'toggle-message-pin', messageId })}
      onUnpinAll={() => dispatch({ type: 'unpin-all-messages', conversationId: conversation.id })}
      onForward={(messageId, targets) =>
        dispatch({ type: 'forward-message', messageId, targets, authorId: currentUserId })
      }
      jumpToMessageId={state.jumpToMessageId}
      onRequestJump={(messageId) => dispatch({ type: 'jump-to-message', messageId })}
      onJumpHandled={() => dispatch({ type: 'clear-jump-target' })}
      focusComposer={state.focusComposer}
      onComposerFocused={() => dispatch({ type: 'focus-composer-handled' })}
      onOpenProjectBoard={
        conversation.projectId
          ? () => {
              dispatch({ type: 'set-project-filter', projectId: conversation.projectId });
              router.push('/tasks');
            }
          : null
      }
    />
  );
}
