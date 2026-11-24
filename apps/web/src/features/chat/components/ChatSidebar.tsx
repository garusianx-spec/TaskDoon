'use client';

import type { ChatFilterId, Conversation, Message } from '@taskin/contracts';
import { CHAT_FILTERS } from '@/data/reference';
import { formatCount } from '@/lib/format';
import { IconButton, Input, SegmentedControl } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { MessagesIcon, SearchIcon, AddIcon } from '@/components/icons';
import { ConversationRow } from '@/features/chat/components/ConversationRow';

export interface ChatSidebarProps {
  readonly conversations: readonly Conversation[];
  readonly messages: readonly Message[];
  readonly activeConversationId: string;
  readonly filter: ChatFilterId;
  readonly search: string;
  readonly unreadFor: (conversationId: string) => number;
  readonly isPinned: (conversationId: string) => boolean;
  readonly onFilterChange: (filter: ChatFilterId) => void;
  readonly onSearchChange: (query: string) => void;
  readonly onSelect: (conversationId: string) => void;
  readonly onTogglePin: (conversationId: string) => void;
  readonly onNewConversation: () => void;
  readonly unreadTotal: number;
}

/** Chat-context column: search, segmented filters and the conversation list. */
export function ChatSidebar({
  conversations,
  messages,
  activeConversationId,
  filter,
  search,
  unreadFor,
  isPinned,
  onFilterChange,
  onSearchChange,
  onSelect,
  onTogglePin,
  onNewConversation,
  unreadTotal,
}: ChatSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col" dir="rtl">
      <div className="flex flex-col gap-3 border-b border-secondary p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-title font-bold text-fg-primary">گفتگوها</h2>
          <IconButton
            label="گفتگوی جدید"
            icon={<AddIcon size={18} />}
            size="sm"
            variant="subtle"
            aria-keyshortcuts="M"
            aria-haspopup="dialog"
            onClick={onNewConversation}
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
          />
        </div>

        <Input
          label="جستجو در گفتگوها"
          hideLabel
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="جستجوی نام، گروه یا پیام…"
          iconStart={<SearchIcon size={18} />}
          className="text-right"
        />

        <SegmentedControl
          ariaLabel="فیلتر گفتگوها"
          options={CHAT_FILTERS.map((entry) => ({
            value: entry.id,
            label: entry.label,
            ...(entry.id === 'unread' && unreadTotal > 0 ? { count: formatCount(unreadTotal) } : {}),
          }))}
          value={filter}
          onValueChange={onFilterChange}
          fullWidth
          className="[&_button]:min-h-[44px] sm:[&_button]:h-7 sm:[&_button]:min-h-0"
        />
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          compact
          icon={<MessagesIcon size={22} />}
          title="گفتگویی یافت نشد"
          description="عبارت جستجو یا فیلتر انتخاب‌شده را تغییر دهید."
        />
      ) : (
        <ul className="flex-1 overflow-y-auto p-2 scrollbar-thin">
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              messages={messages}
              active={conversation.id === activeConversationId}
              unread={unreadFor(conversation.id)}
              pinned={isPinned(conversation.id)}
              onSelect={onSelect}
              onTogglePin={onTogglePin}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
