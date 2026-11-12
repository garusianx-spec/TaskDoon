import type { Message,User } from '@taskin/contracts';


export interface MessageBubbleProps {
  readonly readOnly?: boolean;
  readonly message: Message;
  readonly author: User;
  readonly outgoing: boolean;
  /** True when the previous bubble is from the same author — avatar and name are omitted. */
  readonly grouped: boolean;
  readonly repliedTo: { readonly authorName: string; readonly preview: string } | null;
  readonly currentUserId: string;
  readonly onReply: (messageId: string) => void;
  readonly onConvertToTask: (message: Message) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
  readonly onOpenLinkedTask: (taskId: string) => void;
  /** Mobile long-press (≥500ms) opens the action sheet. */
  readonly onLongPress: (message: Message) => void;
  /** An unsent message of this member's (`message.failed`): send it again, or let it go. */
  readonly onResend?: (messageId: string) => void;
  readonly onDiscard?: (messageId: string) => void;
}
