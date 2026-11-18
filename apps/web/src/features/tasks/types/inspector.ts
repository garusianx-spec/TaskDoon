import type { BoardColumn, Task, User } from '@taskin/contracts';
import type { TaskPatch } from '@/store/workspace-reducer';
import type { RefObject } from 'react';

export interface TaskInspectorProps {
  readonly task: Task;
  readonly currentUser: User;
  /** Board columns, custom ones included — the status picker moves the card between them. */
  readonly columns: readonly BoardColumn[];
  readonly onClose: () => void;
  readonly dismissGuardRef?: RefObject<(() => boolean) | null>;
  readonly onSave: (patch: TaskPatch, columnId?: string) => Promise<void> | void;
  readonly onBusyChange?: (busy: boolean) => void;
  readonly onToggleStar: () => void;
  readonly onToggleSubtask: (subtaskId: string) => void;
  readonly onAddSubtask: (title: string) => void;
  readonly onRemoveSubtask: (subtaskId: string) => void;
  readonly onMoveSubtask: (subtaskId: string, delta: number) => void;
  readonly onAddComment: (body: string, replyToId: string | null) => void;
  readonly onAttachFiles?: (files: readonly File[]) => Promise<void> | void;
  readonly onRemoveAttachment?: (attachmentId: string) => Promise<void> | void;
  /** The chat message the task came from, when it did. */
  readonly source?: TaskSourceView | null;
  /** Opens the source message in its conversation, highlighted. */
  readonly onOpenSource?: () => void;
}

export interface TaskSourceView {
  /** `false` for people outside the message's conversation: they only learn that there is one. */
  readonly accessible: boolean;
  readonly excerpt: string | null;
  readonly authorName: string | null;
  readonly conversationTitle: string | null;
  readonly deleted: boolean;
}
