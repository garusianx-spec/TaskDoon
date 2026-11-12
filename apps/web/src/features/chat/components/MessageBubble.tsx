'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { Avatar, Badge, Button, ClockTime } from '@/components/ui';
import { RefreshIcon, TaskSquareIcon, TrashIcon, WarningIcon } from '@/components/icons';
import { type MessageBubbleProps } from '@/features/chat/types/message-bubble';
import { SystemLine } from '@/features/chat/components/SystemLine';
import { MessageContent } from '@/features/chat/components/MessageContent';
import { MessageQuickActions } from '@/features/chat/components/MessageQuickActions';

export function MessageBubble({
  readOnly = false,
  message,
  author,
  outgoing,
  grouped,
  repliedTo,
  currentUserId,
  onReply,
  onConvertToTask,
  onToggleReaction,
  onOpenLinkedTask,
  onLongPress,
  onResend,
  onDiscard,
}: MessageBubbleProps) {
  const longPressTimer = useRef<number | null>(null);

  if (message.body.kind === 'system') return <SystemLine text={message.body.text} />;

  const startLongPress = () => {
    // An unsent message offers only its own two actions, shown under it.
    if (message.failed || readOnly) return;
    longPressTimer.current = window.setTimeout(() => onLongPress(message), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      className={cn('group/message flex w-full gap-2.5', outgoing ? 'flex-row-reverse' : 'flex-row')}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={(event) => {
        // The long-press gesture doubles as the desktop context menu.
        event.preventDefault();
        if (!message.failed && !readOnly) onLongPress(message);
      }}
    >
      <div className="w-8 shrink-0">
        {!grouped && !outgoing && (
          <Avatar name={author.fullName} initials={author.initials} tone={author.avatarTone} size="sm" />
        )}
      </div>

      <div className={cn('flex min-w-0 max-w-[min(34rem,82%)] flex-col gap-1', outgoing && 'items-end')}>
        {!grouped && (
          <div className={cn('flex items-baseline gap-2', outgoing && 'flex-row-reverse')}>
            <span className="text-caption font-semibold text-fg-primary">
              {outgoing ? 'شما' : author.fullName}
            </span>
            {/* Removed from the workspace: what they wrote stays under their name. */}
            {author.former && !outgoing && (
              <Badge tone="neutral" size="sm">
                عضو سابق
              </Badge>
            )}
            {/* Phase 3.2: answered for them, outside their working hours. */}
            {message.autoReply && (
              <Badge tone="brand" size="sm">
                پاسخ خودکار
              </Badge>
            )}
            <ClockTime iso={message.sentAt} className="text-micro text-fg-quaternary numeric" />
          </div>
        )}

        <div className={cn('flex items-center gap-1', outgoing ? 'flex-row-reverse' : 'flex-row')}>
          <MessageContent message={message} outgoing={outgoing} author={author} repliedTo={repliedTo} />

          {!readOnly && (
            <MessageQuickActions
              message={message}
              outgoing={outgoing}
              currentUserId={currentUserId}
              onReply={onReply}
              onConvertToTask={onConvertToTask}
              onToggleReaction={onToggleReaction}
            />
          )}
        </div>

        {message.failed && !readOnly && (
          <div
            role="group"
            aria-label="پیام ارسال نشد"
            className={cn('flex flex-wrap items-center gap-1.5', outgoing && 'justify-end')}
          >
            <span className="inline-flex items-center gap-1 text-caption font-medium text-status-blocked">
              <WarningIcon size={14} />
              ارسال نشد
            </span>
            {onResend && (
              <Button
                size="xs"
                variant="secondary"
                iconStart={<RefreshIcon size={14} />}
                onClick={() => onResend(message.id)}
              >
                ارسال دوباره
              </Button>
            )}
            {onDiscard && (
              <Button
                size="xs"
                variant="ghost"
                iconStart={<TrashIcon size={14} />}
                onClick={() => onDiscard(message.id)}
              >
                حذف
              </Button>
            )}
          </div>
        )}

        {message.reactions.length > 0 && (
          <div className={cn('flex flex-wrap gap-1', outgoing && 'justify-end')}>
            {message.reactions.map((reaction) => {
              const mine = reaction.userIds.includes(currentUserId);
              return (
                <button
                  key={reaction.emoji}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onToggleReaction(message.id, reaction.emoji)}
                  aria-pressed={mine}
                  aria-label={`${reaction.emoji} — ${formatCount(reaction.userIds.length)} نفر`}
                  className={cn(
                    'inline-flex animate-scale-in items-center gap-1 rounded-full border px-1.5 py-0.5 text-micro transition-colors numeric',
                    mine
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                  )}
                >
                  <span aria-hidden="true">{reaction.emoji}</span>
                  {formatCount(reaction.userIds.length)}
                </button>
              );
            })}
          </div>
        )}

        {message.linkedTaskId && (
          <button
            type="button"
            onClick={() => onOpenLinkedTask(message.linkedTaskId ?? '')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-secondary bg-sunken px-2 py-1 text-micro font-medium text-fg-secondary transition-colors hover:border-brand hover:text-fg-brand"
          >
            <TaskSquareIcon size={14} />
            مشاهده وظیفه مرتبط
          </button>
        )}
      </div>
    </div>
  );
}
