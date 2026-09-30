'use client';

import type { Message } from '@taskin/contracts';
import { BottomSheet } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { messagePreview } from '@/store/selectors';
import { truncate } from '@/lib/format';
import { QUICK_REACTIONS } from '@/data/reference';
import { ConvertToTaskIcon, CopyIcon, PinIcon, ReplyIcon } from '@/components/icons';


export interface MessageActionSheetProps {
  readonly message: Message | null;
  readonly onClose: () => void;
  readonly onReply: (messageId: string) => void;
  readonly onConvertToTask: (message: Message) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
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
}: MessageActionSheetProps) {
  if (!message) return null;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="اقدام روی پیام"
      description={truncate(messagePreview(message), 80)}
    >
      <div role="group" aria-label="واکنش سریع" className="mb-2 grid grid-cols-7 gap-1 px-2 pb-2">
        {QUICK_REACTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            type="button"
            aria-label={`واکنش ${label}`}
            onClick={() => onToggleReaction(message.id, emoji)}
            className="flex aspect-square items-center justify-center rounded-full bg-sunken text-heading-sm leading-none transition-colors active:bg-active"
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        ))}
      </div>

      <MenuList>
        <MenuItem
          icon={<ConvertToTaskIcon size={20} />}
          onSelect={() => onConvertToTask(message)}
          className="bg-brand-subtle py-3 text-body font-semibold text-fg-brand hover:bg-brand-subtle-hover"
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
        <MenuItem icon={<PinIcon size={20} />} onSelect={onClose} className="py-3">
          سنجاق کردن در گفتگو
        </MenuItem>
      </MenuList>
    </BottomSheet>
  );
}
