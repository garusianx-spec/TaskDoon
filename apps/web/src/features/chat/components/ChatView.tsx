'use client';

import { useEffect, useState, type DragEvent } from 'react';
import type { Message, TaskDraft } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { truncate } from '@/lib/format';
import { messageById, messagePreview, userById } from '@/store/selectors';
import { taskDraft } from '@/store/drafts';
import { ChatComposer, MAX_FILE_BYTES } from '@/features/chat/components/ChatComposer';
import { AttachmentPreviewModal } from '@/features/chat/components/AttachmentPreviewModal';
import { MessageActionSheet } from '@/features/chat/components/MessageActionSheet';
import { ScheduledMessagesBar, ScheduledMessagesModal } from '@/features/chat/components/ScheduledMessages';
import { type ChatViewProps } from '@/features/chat/types/chat-view';

import { ConversationHeader } from '@/features/chat/components/ConversationHeader';
import { ConversationTimeline } from '@/features/chat/components/ConversationTimeline';
import { useConversationTimeline } from '@/features/chat/hooks/useConversationTimeline';

/**
 * Main chat surface: header, scrollable body with Jalali date dividers, and the composer.
 * The body auto-scrolls to the newest message whenever the thread or conversation changes.
 */
export function ChatView({
  conversation,
  messages,
  currentUserId,
  onSend,
  onToggleReaction,
  onConvertToTask,
  onOpenTask,
  onOpenDetails,
  onOpenProject,
  onBack,
  defaultProjectId,
  typingNames = [],
  onTyping,
  onAttach,
  onVoice,
  onResend,
  onDiscard,
  focusedMessageId = null,
  onFocusShown,
  scheduled = [],
  onSchedule,
  onSendScheduledNow,
  onCancelScheduled,
}: ChatViewProps) {
  const [scheduledOpen, setScheduledOpen] = useState(false);
  // The list closes with its last entry (sent, cancelled, or another conversation opened) and
  // stays closed: the next schedule shows in the bar, it does not pop the list open.
  const hasScheduled = scheduled.length > 0;
  useEffect(() => {
    if (!hasScheduled) setScheduledOpen(false);
  }, [hasScheduled, conversation.id]);
  const timeline = useConversationTimeline({ conversation, messages, focusedMessageId, onFocusShown });
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [sheetMessage, setSheetMessage] = useState<Message | null>(null);
  // Files picked or dropped, waiting in the preview until they are sent (or dropped again).
  const [queued, setQueued] = useState<readonly File[]>([]);
  const [dragging, setDragging] = useState(false);
  const draggingFiles = (event: DragEvent<HTMLElement>) =>
    !conversation.archived && onAttach !== undefined && event.dataTransfer.types.includes('Files');
  const replyTarget = replyToId ? messageById(messages, replyToId) : undefined;
  const replyPreview = replyTarget
    ? {
        authorName: userById(replyTarget.authorId)?.fullName ?? 'کاربر',
        preview: truncate(messagePreview(replyTarget), 90),
      }
    : null;

  const buildDraft = (message: Message): TaskDraft =>
    taskDraft({
      title: truncate(messagePreview(message), 70),
      description:
        message.body.kind === 'text'
          ? message.body.text
          : `برگرفته از ${messagePreview(message)} در گفتگوی «${conversation.title}»`,
      projectId: defaultProjectId,
      assigneeIds: [currentUserId],
      sourceMessageId: message.id,
      attachments: message.body.kind === 'file' ? [message.body.attachment] : [],
    });

  return (
    <section
      className="relative flex h-full min-h-0 flex-1 flex-col bg-canvas"
      aria-label={`گفتگوی ${conversation.title}`}
      // Files dropped anywhere on the conversation join the preview, as picked ones do.
      onDragOver={(event) => {
        if (!draggingFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!draggingFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        const dropped = [...event.dataTransfer.files].filter(
          (file) => file.size > 0 && file.size <= MAX_FILE_BYTES,
        );
        if (dropped.length > 0) setQueued((current) => [...current, ...dropped]);
      }}
    >
      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand bg-brand-subtle/80 text-title font-semibold text-fg-brand"
        >
          فایل‌ها را اینجا رها کنید
        </div>
      )}
      <ConversationHeader
        conversation={conversation}
        onOpenDetails={onOpenDetails}
        onOpenProject={onOpenProject}
        onBack={onBack}
        timeline={timeline}
      />

      <ConversationTimeline
        conversation={conversation}
        messages={messages}
        currentUserId={currentUserId}
        onToggleReaction={onToggleReaction}
        onOpenTask={onOpenTask}
        onResend={onResend}
        onDiscard={onDiscard}
        onReply={setReplyToId}
        onConvert={(target) => onConvertToTask(buildDraft(target))}
        onLongPress={setSheetMessage}
        timeline={timeline}
      />

      {/* Live only: the line keeps its height, so the thread does not jump when someone types. */}
      {onTyping && (
        <p
          aria-live="polite"
          data-testid="typing-indicator"
          className="h-5 shrink-0 truncate bg-surface px-4 text-caption text-fg-tertiary"
        >
          {typingLine(typingNames)}
        </p>
      )}

      {!conversation.archived && scheduled.length > 0 && (
        <ScheduledMessagesBar count={scheduled.length} onOpen={() => setScheduledOpen(true)} />
      )}
      {!conversation.archived && onSendScheduledNow && onCancelScheduled && (
        <ScheduledMessagesModal
          open={scheduledOpen && scheduled.length > 0}
          entries={scheduled}
          onClose={() => setScheduledOpen(false)}
          onSendNow={onSendScheduledNow}
          onCancel={onCancelScheduled}
        />
      )}

      {conversation.archived ? (
        <p role="status" className="border-t border-secondary p-4 text-body-sm text-fg-secondary">
          این گفتگو برای همیشه بایگانی شده و فقط خواندنی است.
        </p>
      ) : (
        <ChatComposer
          conversationTitle={conversation.title}
          replyPreview={replyPreview}
          onCancelReply={() => setReplyToId(null)}
          {...(onTyping ? { onTyping } : {})}
          {...(onAttach
            ? { onAttach: (files: readonly File[]) => setQueued((current) => [...current, ...files]) }
            : {})}
          {...(onVoice ? { onVoice } : {})}
          onSend={(text) => {
            onSend(text, replyToId);
            setReplyToId(null);
          }}
          {...(onSchedule
            ? {
                onSchedule: (text: string, at: Date) => {
                  onSchedule(text, replyToId, at);
                  setReplyToId(null);
                },
              }
            : {})}
        />
      )}

      {onAttach && !conversation.archived && (
        <AttachmentPreviewModal
          files={queued}
          onFilesChange={setQueued}
          onSend={onAttach}
          maxBytes={MAX_FILE_BYTES}
        />
      )}

      <MessageActionSheet
        message={conversation.archived ? null : sheetMessage}
        onClose={() => setSheetMessage(null)}
        onReply={(id) => {
          setReplyToId(id);
          setSheetMessage(null);
        }}
        onConvertToTask={(message) => {
          onConvertToTask(buildDraft(message));
          setSheetMessage(null);
        }}
        onToggleReaction={(id, emoji) => {
          onToggleReaction(id, emoji);
          setSheetMessage(null);
        }}
      />
    </section>
  );
}

function typingLine(names: readonly string[]): string {
  const [first, second] = names;
  if (!first) return '';
  if (names.length === 1) return `${first} در حال نوشتن است…`;
  if (names.length === 2 && second) return `${first} و ${second} در حال نوشتن هستند…`;
  return `${toPersianDigits(names.length)} نفر در حال نوشتن هستند…`;
}
