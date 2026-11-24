'use client';

import { formatCount } from '@/lib/format';
import { AvatarStack, Badge, IconButton, Input, Tooltip } from '@/components/ui';
import { ArrowBackwardIcon, HashIcon, InfoCircleIcon, SearchIcon } from '@/components/icons';
import { type ChatViewProps } from '@/features/chat/types/chat-view';
import { type ConversationTimelineState } from '@/features/chat/hooks/useConversationTimeline';

export function ConversationHeader({
  conversation,
  onOpenDetails,
  onBack,
  timeline,
}: Pick<ChatViewProps, 'conversation' | 'onOpenDetails'> & {
  readonly onBack: ChatViewProps['onBack'];
  readonly timeline: ConversationTimelineState;
}) {
  const { members, searchOpen, setSearchOpen, inChatQuery, setInChatQuery, visibleThread } = timeline;
  return (
    <header
      className="flex shrink-0 flex-col gap-2 border-b border-secondary bg-surface px-3 py-2.5 sm:px-4"
      dir="rtl"
    >
      <div className="flex items-center gap-3">
        {onBack && (
          <IconButton
            label="بازگشت به فهرست گفتگوها"
            icon={<ArrowBackwardIcon size={20} />}
            size="sm"
            onClick={onBack}
            className="min-h-[44px] min-w-[44px] lg:hidden"
          />
        )}

        {/* The title is the way into the details drawer (members, shared content, settings). */}
        <button
          type="button"
          onClick={onOpenDetails}
          aria-haspopup="dialog"
          aria-label={`${conversation.title} — نمایش جزئیات گفتگو`}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-start transition-colors hover:bg-hover"
        >
          {conversation.kind === 'channel' ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-fg-secondary">
              <HashIcon size={18} variant="twotone" />
            </span>
          ) : (
            <AvatarStack members={members} max={3} size="sm" />
          )}
          <span className="flex min-w-0 flex-col text-right">
            <span className="truncate text-title-sm font-bold text-fg-primary">{conversation.title}</span>
            <span className="truncate text-micro text-fg-tertiary numeric">
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
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
          />
        </Tooltip>
        <Tooltip content="جزئیات گفتگو">
          <IconButton
            label="جزئیات گفتگو"
            icon={<InfoCircleIcon size={20} />}
            size="sm"
            onClick={onOpenDetails}
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
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
            className="text-right"
          />
          {inChatQuery && (
            <Badge tone="brand" numeric>
              {`${formatCount(visibleThread.length)} نتیجه`}
            </Badge>
          )}
        </div>
      )}
    </header>
  );
}
