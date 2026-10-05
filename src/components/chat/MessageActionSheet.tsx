'use client';

import type { Message } from '@/types';
import { BottomSheet } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { messagePreview } from '@/store/selectors';
import { truncate } from '@/lib/format';
import { ConvertToTaskIcon, CopyIcon, PinIcon, ReplyIcon } from '@/components/icons';

const QUICK_REACTIONS = ['👍', '🙏', '🔥', '✅', '👀'] as const;

export interface MessageActionSheetProps {
  readonly message: Message | null;
  readonly onClose: () => void;
  readonly onReply: (messageId: string) => void;
  readonly onConvertToTask: (message: Message) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
  readonly onTogglePin: (messageId: string) => void;
  readonly onForward: (message: Message) => void;
  readonly canPin: boolean;
  readonly canForward: boolean;
}

/**
 * Long-press action sheet. "تبدیل مستقیم به وظیفه" is the primary action and pre-fills the
 * task composer with the message text and any attachment.
 */
export function MessageActionSheet({
  message,
  onClose,
  onReply,
  onConvertToTask,
  onToggleReaction,
  onTogglePin,
  onForward,
  canPin,
  canForward,
}: MessageActionSheetProps) {
  if (!message) return null;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="اقدام روی پیام"
      description={truncate(messagePreview(message), 80)}
    >
      <div className="mb-2 flex justify-between gap-1 px-2 pb-2">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`واکنش ${emoji}`}
            onClick={() => onToggleReaction(message.id, emoji)}
            className="flex size-11 items-center justify-center rounded-full bg-sunken text-heading-sm transition-colors active:bg-active"
          >
            {emoji}
          </button>
        ))}
      </div>

      <MenuList>
        <MenuItem
          icon={<ConvertToTaskIcon size={20} />}
          onSelect={() => onConvertToTask(message)}
          className="bg-brand-subtle py-3 text-body font-semibold text-fg-brand hover:bg-brand-100"
        >
          تبدیل مستقیم به وظیفه
        </MenuItem>
        <MenuItem icon={<ReplyIcon size={20} />} onSelect={() => onReply(message.id)} className="py-3">
          پاسخ به پیام
        </MenuItem>
        <MenuItem
          icon={<CopyIcon size={20} />}
          onSelect={() => {
            if (message.body.kind === 'text') void navigator.clipboard?.writeText(message.body.text);
            onClose();
          }}
          className="py-3"
        >
          کپی متن پیام
        </MenuItem>
        {canForward && (
          <MenuItem
            icon={<ReplyIcon size={20} className="-scale-x-100" />}
            onSelect={() => onForward(message)}
            className="py-3"
          >
            فوروارد به…
          </MenuItem>
        )}
        {canPin && (
          <MenuItem
            icon={<PinIcon size={20} />}
            onSelect={() => {
              onTogglePin(message.id);
              onClose();
            }}
            className="py-3"
          >
            {message.pinned ? 'برداشتن پین پیام' : 'پین کردن پیام در گفتگو'}
          </MenuItem>
        )}
      </MenuList>
    </BottomSheet>
  );
}
