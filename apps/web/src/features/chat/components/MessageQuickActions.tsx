'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { QUICK_REACTIONS } from '@/data/reference';
import { IconButton,Popover,Tooltip } from '@/components/ui';
import { MenuItem,MenuList } from '@/components/ui/Menu';
import {
ConvertToTaskIcon,
CopyIcon,EmojiIcon,
MoreHorizontalIcon,ReplyIcon
} from '@/components/icons';
import { type MessageBubbleProps } from '@/features/chat/types/message-bubble';

export function MessageQuickActions({ message, outgoing, currentUserId, onReply, onConvertToTask, onToggleReaction }: Pick<MessageBubbleProps, "message" | "outgoing" | "currentUserId" | "onReply" | "onConvertToTask" | "onToggleReaction">) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={cn(
        // Pointer layouts only: touch users get the same actions from the
        // long-press bottom sheet, and :hover sticks after a tap on mobile.
        'hidden items-center gap-0.5 opacity-0 transition-opacity lg:flex',
        // An unsent message has nothing on the server to reply to, react to or convert.
        message.failed && 'lg:hidden',
        'group-hover/message:opacity-100 group-focus-within/message:opacity-100',
        menuOpen && 'opacity-100',
      )}
    >
      <Tooltip content="پاسخ">
        <IconButton
          label="پاسخ به پیام"
          icon={<ReplyIcon size={16} />}
          size="xs"
          onClick={() => onReply(message.id)}
        />
      </Tooltip>
      <Tooltip content="تبدیل به وظیفه">
        <IconButton
          label="تبدیل به وظیفه"
          icon={<ConvertToTaskIcon size={16} />}
          size="xs"
          onClick={() => onConvertToTask(message)}
        />
      </Tooltip>
      <Popover
        label="اقدام‌های پیام"
        haspopup="menu"
        align={outgoing ? 'start' : 'end'}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        panelClassName="min-w-64"
        trigger={<IconButton label="اقدام‌های بیشتر" icon={<MoreHorizontalIcon size={16} />} size="xs" />}
      >
        {(close) => (
          <MenuList>
            <div role="group" aria-label="واکنش سریع" className="grid grid-cols-7 gap-0.5 px-0.5 pb-1.5">
              {QUICK_REACTIONS.map(({ emoji, label }) => {
                const mine = message.reactions.some(
                  (reaction) => reaction.emoji === emoji && reaction.userIds.includes(currentUserId),
                );
                return (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`واکنش ${label}`}
                    aria-pressed={mine}
                    title={label}
                    onClick={() => {
                      onToggleReaction(message.id, emoji);
                      close();
                    }}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded-lg text-title leading-none',
                      'transition-[transform,background-color] duration-150 hover:scale-110 hover:bg-hover motion-reduce:hover:scale-100',
                      mine && 'bg-brand-subtle ring-1 ring-inset ring-brand',
                    )}
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                );
              })}
            </div>
            <MenuItem
              icon={<ConvertToTaskIcon size={18} />}
              onSelect={() => {
                onConvertToTask(message);
                close();
              }}
            >
              تبدیل به وظیفه
            </MenuItem>
            <MenuItem
              icon={<ReplyIcon size={18} />}
              onSelect={() => {
                onReply(message.id);
                close();
              }}
            >
              پاسخ
            </MenuItem>
            <MenuItem
              icon={<CopyIcon size={18} />}
              onSelect={() => {
                if (message.body.kind === 'text') {
                  void navigator.clipboard?.writeText(message.body.text);
                }
                close();
              }}
            >
              کپی متن
            </MenuItem>
            <MenuItem
              icon={<EmojiIcon size={18} />}
              onSelect={() => {
                onToggleReaction(message.id, '👍');
                close();
              }}
            >
              واکنش سریع
            </MenuItem>
          </MenuList>
        )}
      </Popover>
    </div>
  );
}
