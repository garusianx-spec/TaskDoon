'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Recorded } from '@/hooks/useVoiceRecorder';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import type { Conversation, Message, ScheduledMessage, TaskDraft } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { formatDateDivider, fromISODate, toPersianDigits } from '@taskin/jalali';
import { formatCount, truncate } from '@/lib/format';
import {
  conversationMessages,
  groupMessagesByDay,
  isGroupedWithPrevious,
  messageById,
  messagePreview,
  userById,
  usersByIds,
} from '@/store/selectors';
import { taskDraft } from '@/store/drafts';
import { AvatarStack, Badge, EmptyState, IconButton, Input, Tooltip } from '@/components/ui';
import { MessageBubble, SystemLine } from './MessageBubble';
import { ChatComposer, MAX_FILE_BYTES } from './ChatComposer';
import { AttachmentPreviewModal, type OutgoingFile } from './AttachmentPreviewModal';
import { MessageActionSheet } from './MessageActionSheet';
import { ScheduledMessagesBar, ScheduledMessagesModal } from './ScheduledMessages';
import {
  ArrowBackwardIcon,
  HashIcon,
  InfoCircleIcon,
  MessagesIcon,
  SearchIcon,
} from '@/components/icons';

export interface ChatViewProps {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly currentUserId: string;
  readonly onSend: (text: string, replyToId: string | null) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
  readonly onConvertToTask: (draft: TaskDraft) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onOpenDetails: () => void;
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
  readonly onSchedule?: (text: string, replyToId: string | null, at: Date) => void;
  readonly onSendScheduledNow?: (scheduledId: string) => void;
  readonly onCancelScheduled?: (scheduledId: string) => void;
}

const HIGHLIGHT_MS = 2400;

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
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [inChatQuery, setInChatQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<Message | null>(null);
  // Files picked or dropped, waiting in the preview until they are sent (or dropped again).
  const [queued, setQueued] = useState<readonly File[]>([]);
  const [dragging, setDragging] = useState(false);
  const draggingFiles = (event: DragEvent<HTMLElement>) => onAttach !== undefined && event.dataTransfer.types.includes('Files');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  /** What was on screen last render, to tell "opened a thread" from "a message arrived". */
  const rendered = useRef<{ readonly conversationId: string; readonly count: number } | null>(null);

  const thread = useMemo(
    () => conversationMessages(messages, conversation.id),
    [messages, conversation.id],
  );

  const visibleThread = useMemo(() => {
    const query = inChatQuery.trim().toLowerCase();
    if (!query) return thread;
    return thread.filter((message) => messagePreview(message).toLowerCase().includes(query));
  }, [thread, inChatQuery]);

  const groups = useMemo(() => groupMessagesByDay(visibleThread), [visibleThread]);
  const members = useMemo(() => usersByIds(conversation.memberIds), [conversation.memberIds]);

  // Layout effect, so the jump happens before paint: opening a thread lands on its newest
  // message with no visible scroll from the top. A message added to the open thread (sent
  // or received — both are appended to the tail) glides into view instead.
  useIsomorphicLayoutEffect(() => {
    const previous = rendered.current;
    rendered.current = { conversationId: conversation.id, count: thread.length };
    const container = scrollRef.current;
    if (!container) return;

    if (previous === null || previous.conversationId !== conversation.id) {
      container.scrollTop = container.scrollHeight;
    } else if (thread.length > previous.count) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [conversation.id, thread.length]);

  // «پیام مبدأ»: once the message is in the thread, bring it to the middle and flash it.
  const focusPresent = focusedMessageId !== null && thread.some((message) => message.id === focusedMessageId);
  useEffect(() => {
    if (!focusedMessageId || !focusPresent) return;
    const element = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${focusedMessageId}"]`);
    element?.scrollIntoView({ block: 'center' });
    setHighlightedId(focusedMessageId);
    onFocusShown?.();
  }, [focusedMessageId, focusPresent, onFocusShown]);

  useEffect(() => {
    if (!highlightedId) return;
    const timer = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

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
        const dropped = [...event.dataTransfer.files].filter((file) => file.size > 0 && file.size <= MAX_FILE_BYTES);
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
      <header className="flex shrink-0 flex-col gap-2 border-b border-secondary bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <IconButton
              label="بازگشت به فهرست گفتگوها"
              icon={<ArrowBackwardIcon size={20} />}
              size="sm"
              onClick={onBack}
              className="lg:hidden"
            />
          )}

          {/* The title is the way into the details drawer (members, shared content, settings). */}
          <button
            type="button"
            onClick={onOpenDetails}
            aria-haspopup="dialog"
            aria-label={`${conversation.title} — نمایش جزئیات گفتگو`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-start transition-colors hover:bg-hover"
          >
            {conversation.kind === 'channel' ? (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-fg-secondary">
                <HashIcon size={18} variant="twotone" />
              </span>
            ) : (
              <AvatarStack members={members} max={3} size="sm" />
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-title-sm font-bold text-fg-primary">{conversation.title}</span>
              <span className="numeric truncate text-micro text-fg-tertiary">
                {conversation.kind === 'direct'
                  ? conversation.topic
                  : `${formatCount(members.length)} عضو، ${conversation.topic}`}
              </span>
            </span>
          </button>

          <Tooltip content="جستجو در گفتگو">
            <IconButton
              label="جستجو در این گفتگو"
              icon={<SearchIcon size={20} />}
              size="sm"
              active={searchOpen}
              onClick={() => {
                setSearchOpen((open) => !open);
                if (searchOpen) setInChatQuery('');
              }}
            />
          </Tooltip>
          <Tooltip content="جزئیات گفتگو">
            <IconButton
              label="جزئیات گفتگو"
              icon={<InfoCircleIcon size={20} />}
              size="sm"
              onClick={onOpenDetails}
            />
          </Tooltip>
        </div>

        {searchOpen && (
          <div className="flex items-center gap-2 pb-1">
            <Input
              label="جستجو در این گفتگو"
              hideLabel
              autoFocus
              type="search"
              value={inChatQuery}
              onChange={(event) => setInChatQuery(event.target.value)}
              placeholder="جستجو میان پیام‌های این گفتگو…"
              iconStart={<SearchIcon size={18} />}
              containerClassName="flex-1"
            />
            {inChatQuery && (
              <Badge tone="brand" numeric>
                {`${formatCount(visibleThread.length)} نتیجه`}
              </Badge>
            )}
          </div>
        )}
      </header>

      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {groups.length === 0 ? (
          <EmptyState
            icon={<MessagesIcon size={26} />}
            title={inChatQuery ? 'پیامی مطابق جستجو پیدا نشد' : 'هنوز پیامی در این گفتگو نیست'}
            description={
              inChatQuery
                ? 'عبارت دیگری را امتحان کنید یا جستجو را ببندید.'
                : 'اولین پیام را بنویسید تا گفتگو آغاز شود.'
            }
          />
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-1">
            {groups.map((group) => (
              <div key={group.isoDate} className="flex flex-col gap-1">
                <DateDivider iso={group.isoDate} />
                {group.messages.map((message, index) => {
                  if (message.body.kind === 'system') {
                    return (
                      <div key={message.id} data-message-id={message.id}>
                        <SystemLine text={message.body.text} />
                      </div>
                    );
                  }
                  const author = userById(message.authorId);
                  if (!author) return null;
                  const previous = group.messages[index - 1];
                  const replied = message.replyToId ? messageById(messages, message.replyToId) : undefined;

                  return (
                    <div
                      key={message.id}
                      data-message-id={message.id}
                      data-highlighted={highlightedId === message.id || undefined}
                      className={cn(
                        'rounded-xl transition-colors duration-700',
                        index > 0 && 'mt-0.5',
                        highlightedId === message.id && 'bg-brand-subtle ring-2 ring-brand',
                      )}
                    >
                      <MessageBubble
                        message={message}
                        author={author}
                        outgoing={message.authorId === currentUserId}
                        grouped={isGroupedWithPrevious(message, previous)}
                        repliedTo={
                          replied
                            ? {
                                authorName: userById(replied.authorId)?.fullName ?? 'کاربر',
                                preview: truncate(messagePreview(replied), 90),
                              }
                            : null
                        }
                        currentUserId={currentUserId}
                        onReply={setReplyToId}
                        onConvertToTask={(target) => onConvertToTask(buildDraft(target))}
                        onToggleReaction={onToggleReaction}
                        onOpenLinkedTask={onOpenTask}
                        onLongPress={setSheetMessage}
                        {...(onResend ? { onResend } : {})}
                        {...(onDiscard ? { onDiscard } : {})}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            {/* scroll-margin covers the scroller's bottom padding, so the newest message lands flush. */}
            <div ref={bottomRef} aria-hidden="true" className="scroll-mb-4" />
          </div>
        )}
      </div>

      {/* Live only: the line keeps its height, so the thread does not jump when someone types. */}
      {onTyping && (
        <p aria-live="polite" data-testid="typing-indicator" className="h-5 shrink-0 truncate bg-surface px-4 text-caption text-fg-tertiary">
          {typingLine(typingNames)}
        </p>
      )}

      {scheduled.length > 0 && <ScheduledMessagesBar count={scheduled.length} onOpen={() => setScheduledOpen(true)} />}
      {onSendScheduledNow && onCancelScheduled && (
        <ScheduledMessagesModal
          open={scheduledOpen && scheduled.length > 0}
          entries={scheduled}
          onClose={() => setScheduledOpen(false)}
          onSendNow={onSendScheduledNow}
          onCancel={onCancelScheduled}
        />
      )}

      <ChatComposer
        conversationTitle={conversation.title}
        replyPreview={replyPreview}
        onCancelReply={() => setReplyToId(null)}
        {...(onTyping ? { onTyping } : {})}
        {...(onAttach ? { onAttach: (files: readonly File[]) => setQueued((current) => [...current, ...files]) } : {})}
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

      {onAttach && (
        <AttachmentPreviewModal files={queued} onFilesChange={setQueued} onSend={onAttach} maxBytes={MAX_FILE_BYTES} />
      )}

      <MessageActionSheet
        message={sheetMessage}
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

/**
 * Day separator. An in-flow block (`relative`, never `sticky`), so it scrolls away with the
 * messages of its day instead of hovering over the bubbles beneath it.
 */
function DateDivider({ iso }: { readonly iso: string }) {
  return (
    <div role="separator" aria-label={formatDateDivider(fromISODate(iso))} className="relative flex items-center gap-3 py-3">
      <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
      <span className="rounded-full border border-secondary bg-surface px-3 py-1 text-micro font-semibold text-fg-tertiary shadow-xs">
        {formatDateDivider(fromISODate(iso))}
      </span>
      <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
    </div>
  );
}

/** «سحر در حال نوشتن است…», «سحر و علی …», or a count beyond two people. */
function typingLine(names: readonly string[]): string {
  const [first, second] = names;
  if (!first) return '';
  if (names.length === 1) return `${first} در حال نوشتن است…`;
  if (names.length === 2 && second) return `${first} و ${second} در حال نوشتن هستند…`;
  return `${toPersianDigits(names.length)} نفر در حال نوشتن هستند…`;
}
