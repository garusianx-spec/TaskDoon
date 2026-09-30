'use client';

import type { ChatFilterId, Conversation, Message } from '@taskin/contracts';
import { CHAT_FILTERS } from '@/data/reference';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { messagePreview, userById } from '@/store/selectors';
import { Avatar, CountPill, EmptyState, IconButton, Input, RelativeTime, SegmentedControl } from '@/components/ui';
import { HashIcon, MessagesIcon, MicrophoneIcon, MuteIcon, PaperclipIcon, PinIcon, SearchIcon, AddIcon } from '@/components/icons';

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
    <div className="flex h-full min-h-0 flex-col">
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
        <ul className="scrollbar-thin flex-1 overflow-y-auto p-2">
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

interface ConversationRowProps {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly active: boolean;
  readonly unread: number;
  readonly pinned: boolean;
  readonly onSelect: (conversationId: string) => void;
  readonly onTogglePin: (conversationId: string) => void;
}

function ConversationRow({
  conversation,
  messages,
  active,
  unread,
  pinned,
  onSelect,
  onTogglePin,
}: ConversationRowProps) {
  const thread = messages.filter((message) => message.conversationId === conversation.id);
  const last = thread[thread.length - 1];
  const preview = messagePreview(last);
  const lastAuthor = last ? userById(last.authorId) : undefined;
  const isVoice = last?.body.kind === 'voice';
  const isFile = last?.body.kind === 'file';

  const initials =
    conversation.kind === 'direct'
      ? (userById(conversation.memberIds.find((id) => id !== 'u-sahar') ?? '')?.initials ?? 'گ')
      : conversation.title.slice(0, 2);

  return (
    <li className="group/row">
      <div
        className={cn(
          'flex items-start gap-1 rounded-xl p-2.5 transition-colors',
          active ? 'bg-brand-subtle' : 'hover:bg-hover',
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(conversation.id)}
          aria-current={active ? 'true' : undefined}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-start"
        >
          {conversation.kind === 'channel' ? (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sunken text-fg-secondary">
              <HashIcon size={20} variant="twotone" />
            </span>
          ) : (
            <Avatar
              name={conversation.title}
              initials={initials}
              tone={conversation.tone}
              size="md"
              decorative
            />
          )}

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'truncate text-body-sm',
                  unread > 0 || active ? 'font-bold text-fg-primary' : 'font-semibold text-fg-secondary',
                )}
              >
                {conversation.title}
              </span>
              {conversation.muted && <MuteIcon size={13} className="shrink-0 text-fg-quaternary" label="بی‌صدا" />}
              {last && (
                <RelativeTime
                  iso={last.sentAt}
                  className="numeric ms-auto shrink-0 text-micro text-fg-quaternary"
                />
              )}
            </span>

            <span className="flex items-center gap-1.5">
              {isVoice && <MicrophoneIcon size={14} className="shrink-0 text-fg-brand" />}
              {isFile && <PaperclipIcon size={14} className="shrink-0 text-fg-quaternary" />}
              <span
                className={cn(
                  'truncate text-caption',
                  unread > 0 ? 'font-medium text-fg-secondary' : 'text-fg-tertiary',
                )}
              >
                {conversation.kind !== 'direct' && lastAuthor && last?.body.kind !== 'system'
                  ? `${lastAuthor.fullName.split(' ')[0]}: ${preview}`
                  : preview}
              </span>
              {unread > 0 && <CountPill value={formatCount(unread)} className="ms-auto" />}
            </span>
          </span>
        </button>

        <IconButton
          label={pinned ? `برداشتن سنجاق ${conversation.title}` : `سنجاق کردن ${conversation.title}`}
          icon={<PinIcon size={15} />}
          size="xs"
          onClick={() => onTogglePin(conversation.id)}
          className={cn(
            // Always occupies its slot so the row never reflows on hover; only its
            // opacity changes. A pinned conversation keeps it lit as the pin indicator.
            'shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100',
            pinned && 'text-fg-brand opacity-100',
          )}
        />
      </div>
    </li>
  );
}
