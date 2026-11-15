import type { Recorded } from '@/features/chat/hooks/useVoiceRecorder';
import type { Conversation, Message, ScheduledMessage, TaskDraft } from '@taskin/contracts';
import { type OutgoingFile } from '@/features/chat/components/AttachmentPreviewModal';

export interface ChatViewProps {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly currentUserId: string;
  readonly onSend: (text: string, replyToId: string | null) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
  readonly onConvertToTask: (draft: TaskDraft) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onOpenDetails: () => void;
  readonly onOpenProject?: () => void;
  /** Mobile only — returns to the conversation list. */
  readonly onBack?: () => void;
  readonly defaultProjectId: string;
  /** Who else is typing in this conversation right now (live only). */
  readonly typingNames?: readonly string[];
  readonly onTyping?: (active: boolean) => void;
  /** Files picked or dropped, after their preview: one message each, a caption on one of them. */
  readonly onAttach?: (files: readonly OutgoingFile[]) => void;
  readonly onVoice?: (recording: Recorded) => void;
  /** An unsent message of this member's: send it again, or let it go. */
  readonly onResend?: (messageId: string) => void;
  readonly onDiscard?: (messageId: string) => void;
  /** A message to scroll to and highlight (a task's «پیام مبدأ»); `onFocusShown` clears it. */
  readonly focusedMessageId?: string | null;
  readonly onFocusShown?: () => void;
  /** Phase 3.2: this member's messages waiting to be sent here, and what can be done with them. */
  readonly scheduled?: readonly ScheduledMessage[];
  readonly onSchedule?: (
    text: string,
    replyToId: string | null,
    at: Date,
    commandId: string,
  ) => Promise<void>;
  readonly onSendScheduledNow?: (scheduledId: string) => void;
  readonly onCancelScheduled?: (scheduledId: string) => void;
}
