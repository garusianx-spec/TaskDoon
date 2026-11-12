'use client';

import { useCallback } from 'react';
import { useLive, useWorkspace } from '@/store/WorkspaceProvider';
import { conversationById, userById } from '@/store/selectors';
import { nextLocalId } from '@/store/ids';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { ChatView } from '@/features/chat/components/ChatView';

interface ChatContentProps {
  readonly onBack: () => void;
  readonly defaultProjectId: string;
  readonly currentUserId: string;
}

/** Split out so the composer hook resolves inside the `AppShell` provider. */
export function ChatContent({ onBack, defaultProjectId, currentUserId }: ChatContentProps) {
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
      onOpenDetails={() => dispatch({ type: 'open-conversation-details', conversationId: conversation.id })}
      typingNames={(state.typingByConversation[conversation.id] ?? []).map(
        (userId) => userById(userId)?.fullName ?? 'کسی',
      )}
      onAttach={(items) => {
        for (const { file, caption, asFile } of items) {
          dispatch({
            type: 'send-file',
            conversationId: conversation.id,
            authorId: currentUserId,
            messageId: nextLocalId('m'),
            picked: {
              attachmentId: nextLocalId('att'),
              file,
              name: file.name,
              previewUrl: URL.createObjectURL(file),
            },
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
      scheduled={state.scheduledMessages.filter(
        (entry) => entry.conversationId === conversation.id && entry.authorId === currentUserId,
      )}
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
      onSendScheduledNow={(scheduledId) =>
        dispatch({ type: 'send-scheduled-now', scheduledId, messageId: nextLocalId('m') })
      }
      onCancelScheduled={(scheduledId) => dispatch({ type: 'cancel-scheduled-message', scheduledId })}
      {...(live ? { onTyping: (active: boolean) => live.store.typing(conversation.id, active) } : {})}
    />
  );
}
