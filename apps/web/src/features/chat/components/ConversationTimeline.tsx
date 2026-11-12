'use client';

import type { Message } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { formatDateDivider, fromISODate } from '@taskin/jalali';
import { truncate } from '@/lib/format';
import { isGroupedWithPrevious, messageById, messagePreview, userById } from '@/store/selectors';
import { EmptyState } from '@/components/shared/EmptyState';
import { MessageBubble } from '@/features/chat/components/MessageBubble';
import { SystemLine } from '@/features/chat/components/SystemLine';
import { MessagesIcon } from '@/components/icons';
import { type ChatViewProps } from '@/features/chat/types/chat-view';
import { type ConversationTimelineState } from '@/features/chat/hooks/useConversationTimeline';

export function ConversationTimeline({
  conversation,
  messages,
  currentUserId,
  onToggleReaction,
  onOpenTask,
  onResend,
  onDiscard,
  onReply,
  onConvert,
  onLongPress,
  timeline,
}: Pick<ChatViewProps, 'conversation' | 'messages' | 'currentUserId' | 'onToggleReaction' | 'onOpenTask'> & {
  readonly onResend: ChatViewProps['onResend'];
  readonly onDiscard: ChatViewProps['onDiscard'];
  readonly onReply: (id: string) => void;
  readonly onConvert: (message: Message) => void;
  readonly onLongPress: (message: Message) => void;
  readonly timeline: ConversationTimelineState;
}) {
  const { groups, inChatQuery, highlightedId, scrollRef, bottomRef } = timeline;
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin sm:px-6">
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
                      readOnly={conversation.archived}
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
                      onReply={onReply}
                      onConvertToTask={onConvert}
                      onToggleReaction={conversation.archived ? () => undefined : onToggleReaction}
                      onOpenLinkedTask={onOpenTask}
                      onLongPress={conversation.archived ? () => undefined : onLongPress}
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
  );
}

/**
 * Day separator. An in-flow block (`relative`, never `sticky`), so it scrolls away with the
 * messages of its day instead of hovering over the bubbles beneath it.
 */
function DateDivider({ iso }: { readonly iso: string }) {
  return (
    <div
      role="separator"
      aria-label={formatDateDivider(fromISODate(iso))}
      className="relative flex items-center gap-3 py-3"
    >
      <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
      <span className="rounded-full border border-secondary bg-surface px-3 py-1 text-micro font-semibold text-fg-tertiary shadow-xs">
        {formatDateDivider(fromISODate(iso))}
      </span>
      <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
    </div>
  );
}

/** «سحر در حال نوشتن است…», «سحر و علی …», or a count beyond two people. */
