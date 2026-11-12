'use client';

import type { Conversation,Message } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { messagePreview,userById } from '@/store/selectors';
import { Avatar,CountPill,IconButton,RelativeTime } from '@/components/ui';
import { HashIcon,MicrophoneIcon,MuteIcon,PaperclipIcon,PinIcon } from '@/components/icons';


interface ConversationRowProps {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly active: boolean;
  readonly unread: number;
  readonly pinned: boolean;
  readonly onSelect: (conversationId: string) => void;
  readonly onTogglePin: (conversationId: string) => void;
}

export function ConversationRow({
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
