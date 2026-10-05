'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, ForwardTarget, Message, TaskDraft } from '@/types';
import { cn } from '@/lib/cn';
import { formatDateDivider } from '@/lib/jalali';
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
import { AvatarStack, Badge, Button, EmptyState, IconButton, Input, Tooltip } from '@/components/ui';
import { MessageBubble } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { MessageActionSheet } from './MessageActionSheet';
import { PinnedBanner } from './PinnedBanner';
import { ForwardMessageModal } from './ForwardMessageModal';
import {
  ArrowBackwardIcon,
  HashIcon,
  InfoCircleIcon,
  MessagesIcon,
  PaperclipIcon,
  SearchIcon,
  TaskSquareIcon,
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
  readonly onTogglePin: (messageId: string) => void;
  readonly onUnpinAll: () => void;
  readonly onForward: (messageId: string, targets: readonly ForwardTarget[]) => void;
  readonly canPin: boolean;
  readonly canForward: boolean;
  /** Message the shell asked the viewport to scroll to; cleared via `onJumpHandled`. */
  readonly jumpToMessageId: string | null;
  readonly onRequestJump: (messageId: string) => void;
  readonly onJumpHandled: () => void;
  /** Present when this conversation is the channel of a project. */
  readonly onOpenProjectBoard: (() => void) | null;
  readonly focusComposer: boolean;
  readonly onComposerFocused: () => void;
  /** Mobile only — returns to the conversation list. */
  readonly onBack?: () => void;
  readonly defaultProjectId: string;
}

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
  onTogglePin,
  onUnpinAll,
  onForward,
  canPin,
  canForward,
  jumpToMessageId,
  onRequestJump,
  onJumpHandled,
  onOpenProjectBoard,
  focusComposer,
  onComposerFocused,
}: ChatViewProps) {
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [inChatQuery, setInChatQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
  const pinnedMessages = useMemo(() => thread.filter((message) => message.pinned), [thread]);

  /**
   * Scrolls a message into view and plays a short highlight pulse. Clearing the search first
   * matters: the target may be filtered out of `visibleThread`, in which case there is no
   * node to scroll to.
   */
  const jumpTo = useCallback(
    (messageId: string) => {
      setInChatQuery('');
      // Wait a frame so a cleared filter has re-rendered the full thread.
      requestAnimationFrame(() => {
        const node = messageRefs.current.get(messageId);
        if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedId(messageId);
      });
    },
    [],
  );

  // Drive the pulse from the shell-level jump request, then hand the flag back.
  useEffect(() => {
    if (!jumpToMessageId) return;
    jumpTo(jumpToMessageId);
    onJumpHandled();
  }, [jumpToMessageId, jumpTo, onJumpHandled]);

  useEffect(() => {
    if (!highlightedId) return;
    const timer = window.setTimeout(() => setHighlightedId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  useEffect(() => {
    if (highlightedId) return;
    bottomRef.current?.scrollIntoView({ block: 'end' });
    // `highlightedId` is deliberately read but not tracked: a jump mid-thread must not be
    // yanked back to the newest message, yet the pulse ending should not re-scroll either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, thread.length]);

  const replyTarget = replyToId ? messageById(messages, replyToId) : undefined;
  const replyPreview = replyTarget
    ? {
        authorName: userById(replyTarget.authorId)?.fullName ?? 'کاربر',
        preview: truncate(messagePreview(replyTarget), 90),
      }
    : null;

  const buildDraft = (message: Message): TaskDraft => ({
    title: truncate(messagePreview(message), 70),
    description:
      message.body.kind === 'text'
        ? message.body.text
        : `برگرفته از ${messagePreview(message)} در گفتگوی «${conversation.title}»`,
    projectId: defaultProjectId,
    status: 'todo',
    priority: 'medium',
    assigneeIds: [currentUserId],
    dueDate: null,
    sourceMessageId: message.id,
    attachments: message.body.kind === 'file' ? [message.body.attachment] : [],
    subtasks: [],
    reminder: null,
    recurrence: null,
  });

  const attachmentCount = thread.filter((message) => message.body.kind === 'file').length;

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-canvas" aria-label={`گفتگوی ${conversation.title}`}>
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

          <button
            type="button"
            onClick={onOpenDetails}
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

          {onOpenProjectBoard && (
            <Tooltip content="مشاهده بورد وظایف پروژه">
              <Button
                size="sm"
                variant="secondary"
                iconStart={<TaskSquareIcon size={15} />}
                onClick={onOpenProjectBoard}
                className="hidden sm:inline-flex"
              >
                بورد وظایف پروژه
              </Button>
            </Tooltip>
          )}

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
          <Tooltip content="فایل‌های گفتگو">
            <IconButton
              label={`کشوی فایل‌ها (${attachmentCount} فایل)`}
              icon={<PaperclipIcon size={20} />}
              size="sm"
              onClick={onOpenDetails}
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

      <PinnedBanner
        pinned={pinnedMessages}
        canManage={canPin}
        onJump={onRequestJump}
        onUnpin={onTogglePin}
        onUnpinAll={onUnpinAll}
      />

      <div ref={scrollerRef} className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4 sm:px-6">
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
                  const author = userById(message.authorId);
                  if (!author) return null;
                  const previous = group.messages[index - 1];
                  const replied = message.replyToId ? messageById(messages, message.replyToId) : undefined;

                  return (
                    <div
                      key={message.id}
                      ref={(node) => {
                        if (node) messageRefs.current.set(message.id, node);
                        else messageRefs.current.delete(message.id);
                      }}
                      className={cn(index > 0 && 'mt-0.5', 'scroll-mt-24')}
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
                        onTogglePin={onTogglePin}
                        onForward={setForwardMessage}
                        canPin={canPin}
                        canForward={canForward}
                        highlighted={highlightedId === message.id}
                        forwardedFromName={
                          message.forwardedFrom
                            ? (userById(message.forwardedFrom.authorId)?.fullName ?? 'کاربر حذف‌شده')
                            : null
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <ChatComposer
        conversationTitle={conversation.title}
        autoFocus={focusComposer}
        onAutoFocusHandled={onComposerFocused}
        replyPreview={replyPreview}
        onCancelReply={() => setReplyToId(null)}
        onSend={(text) => {
          onSend(text, replyToId);
          setReplyToId(null);
        }}
      />

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
        onTogglePin={onTogglePin}
        onForward={(target) => {
          setSheetMessage(null);
          setForwardMessage(target);
        }}
        canPin={canPin}
        canForward={canForward}
      />

      <ForwardMessageModal
        message={forwardMessage}
        currentConversationId={conversation.id}
        onClose={() => setForwardMessage(null)}
        onForward={(targets) => {
          if (forwardMessage) onForward(forwardMessage.id, targets);
        }}
      />
    </section>
  );
}

function DateDivider({ iso }: { readonly iso: string }) {
  return (
    <div className="sticky top-0 z-sticky flex items-center gap-3 py-3">
      <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
      <span className="rounded-full border border-secondary bg-surface px-3 py-1 text-micro font-semibold text-fg-tertiary shadow-xs">
        {formatDateDivider(iso)}
      </span>
      <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
    </div>
  );
}
