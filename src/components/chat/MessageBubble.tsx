'use client';

import { useRef, useState } from 'react';
import type { Attachment, Message, User } from '@/types';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/jalali';
import { formatFileSize } from '@/lib/format';
import { Avatar, Badge, IconButton, Popover, Tooltip } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { VoicePlayer } from './VoicePlayer';
import {
  ArchiveIcon,
  ConvertToTaskIcon,
  CopyIcon,
  PinIcon,
  DocumentIcon,
  DoubleCheckIcon,
  DownloadIcon,
  EmojiIcon,
  ImageIcon,
  MoreHorizontalIcon,
  ReplyIcon,
  SheetIcon,
  TaskSquareIcon,
} from '@/components/icons';
import { formatJalali } from '@/lib/jalali';

const ATTACHMENT_ICONS = {
  image: ImageIcon,
  document: DocumentIcon,
  sheet: SheetIcon,
  archive: ArchiveIcon,
  audio: DocumentIcon,
  link: DocumentIcon,
} as const;

const QUICK_REACTIONS = ['👍', '🙏', '🔥', '✅', '👀'] as const;

export interface MessageBubbleProps {
  readonly message: Message;
  readonly author: User;
  readonly outgoing: boolean;
  /** True when the previous bubble is from the same author — avatar and name are omitted. */
  readonly grouped: boolean;
  readonly repliedTo: { readonly authorName: string; readonly preview: string } | null;
  readonly currentUserId: string;
  readonly onReply: (messageId: string) => void;
  readonly onConvertToTask: (message: Message) => void;
  readonly onToggleReaction: (messageId: string, emoji: string) => void;
  readonly onOpenLinkedTask: (taskId: string) => void;
  /** Mobile long-press (≥500ms) opens the action sheet. */
  readonly onLongPress: (message: Message) => void;
  readonly onTogglePin: (messageId: string) => void;
  readonly onForward: (message: Message) => void;
  /** Pin is permission-gated; forwarding needs the `create` right on messages. */
  readonly canPin: boolean;
  readonly canForward: boolean;
  /** Name of the original author when this message was forwarded in. */
  readonly forwardedFromName: string | null;
  /** Set while the jump-to-message pulse is playing on this bubble. */
  readonly highlighted: boolean;
}

export function MessageBubble({
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
  onTogglePin,
  onForward,
  canPin,
  canForward,
  forwardedFromName,
  highlighted,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  if (message.body.kind === 'system') {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-sunken px-3 py-1 text-micro text-fg-tertiary">
          {message.body.text}
        </span>
      </div>
    );
  }

  const startLongPress = () => {
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
        onLongPress(message);
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
            <span className="numeric text-micro text-fg-quaternary">{formatTime(message.sentAt)}</span>
          </div>
        )}

        <div className={cn('flex items-center gap-1', outgoing ? 'flex-row-reverse' : 'flex-row')}>
          <div
            className={cn(
              'relative min-w-0 rounded-2xl px-3.5 py-2.5 shadow-xs transition-shadow',
              outgoing
                ? 'rounded-se-sm bg-brand-solid text-fg-on-brand'
                : 'rounded-ss-sm border border-secondary bg-surface text-fg-primary',
              highlighted && 'animate-pulse-ring ring-2 ring-brand ring-offset-2',
            )}
          >
            {forwardedFromName && (
              <p
                className={cn(
                  'mb-1.5 flex items-center gap-1 text-micro font-medium',
                  outgoing ? 'text-fg-on-brand/75' : 'text-fg-tertiary',
                )}
              >
                <ReplyIcon size={12} className="-scale-x-100" />
                <span title={message.forwardedFrom ? formatJalali(message.forwardedFrom.sentAt, 'full') : undefined}>
                  {`ارسال شده از ${forwardedFromName}`}
                </span>
              </p>
            )}

            {message.pinned && (
              <span
                className={cn(
                  'absolute -top-1.5 flex size-5 items-center justify-center rounded-full shadow-xs',
                  outgoing ? '-start-1.5 bg-white text-brand-600' : '-end-1.5 bg-brand-solid text-fg-on-brand',
                )}
                title="پیام پین‌شده"
              >
                <PinIcon size={11} />
                <span className="sr-only">پیام پین‌شده</span>
              </span>
            )}
            {repliedTo && (
              <div
                className={cn(
                  'mb-2 border-s-2 ps-2 text-caption',
                  outgoing ? 'border-white/40 text-fg-on-brand/80' : 'border-brand-300 text-fg-tertiary',
                )}
              >
                <p className="font-semibold">{repliedTo.authorName}</p>
                <p className="line-clamp-2">{repliedTo.preview}</p>
              </div>
            )}

            {message.body.kind === 'text' && (
              <p className="whitespace-pre-wrap break-words text-body-sm leading-6">{message.body.text}</p>
            )}

            {message.body.kind === 'voice' && (
              <VoicePlayer
                durationSec={message.body.durationSec}
                waveform={message.body.waveform}
                src={message.body.src}
                outgoing={outgoing}
                label={`پیام صوتی ${author.fullName}`}
              />
            )}

            {message.body.kind === 'file' && (
              <FileCard attachment={message.body.attachment} caption={message.body.caption} outgoing={outgoing} />
            )}

            <div
              className={cn(
                'mt-1 flex items-center gap-1',
                outgoing ? 'justify-start' : 'justify-end',
              )}
            >
              {message.edited && (
                <span className={cn('text-micro', outgoing ? 'text-fg-on-brand/70' : 'text-fg-quaternary')}>
                  ویرایش‌شده
                </span>
              )}
              <span
                className={cn('numeric text-micro', outgoing ? 'text-fg-on-brand/70' : 'text-fg-quaternary')}
              >
                {formatTime(message.sentAt)}
              </span>
              {outgoing && (
                <DoubleCheckIcon
                  size={14}
                  className={message.readByIds.length > 0 ? 'text-white' : 'text-fg-on-brand/60'}
                  label={message.readByIds.length > 0 ? 'خوانده شد' : 'ارسال شد'}
                />
              )}
            </div>
          </div>

          <div
            className={cn(
              // Pointer layouts only: touch users get the same actions from the
              // long-press bottom sheet, and :hover sticks after a tap on mobile.
              'hidden items-center gap-0.5 opacity-0 transition-opacity lg:flex',
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
            {canPin && (
              <Tooltip content={message.pinned ? 'برداشتن پین' : 'پین کردن پیام در گفتگو'}>
                <IconButton
                  label={message.pinned ? 'برداشتن پین پیام' : 'پین کردن پیام در گفتگو'}
                  icon={<PinIcon size={16} />}
                  size="xs"
                  active={message.pinned}
                  onClick={() => onTogglePin(message.id)}
                />
              </Tooltip>
            )}
            <Popover
              label="اقدام‌های پیام"
              haspopup="menu"
              align={outgoing ? 'start' : 'end'}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              panelClassName="min-w-52"
              trigger={<IconButton label="اقدام‌های بیشتر" icon={<MoreHorizontalIcon size={16} />} size="xs" />}
            >
              {(close) => (
                <MenuList>
                  <div className="flex gap-1 px-1 pb-1.5">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        aria-label={`واکنش ${emoji}`}
                        onClick={() => {
                          onToggleReaction(message.id, emoji);
                          close();
                        }}
                        className="flex size-8 items-center justify-center rounded-lg text-title transition-colors hover:bg-hover"
                      >
                        {emoji}
                      </button>
                    ))}
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
                  {canForward && (
                    <MenuItem
                      icon={<ReplyIcon size={18} className="-scale-x-100" />}
                      onSelect={() => {
                        onForward(message);
                        close();
                      }}
                    >
                      فوروارد به…
                    </MenuItem>
                  )}
                  {canPin && (
                    <MenuItem
                      icon={<PinIcon size={18} />}
                      onSelect={() => {
                        onTogglePin(message.id);
                        close();
                      }}
                    >
                      {message.pinned ? 'برداشتن پین پیام' : 'پین کردن پیام در گفتگو'}
                    </MenuItem>
                  )}
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
        </div>

        {message.reactions.length > 0 && (
          <div className={cn('flex flex-wrap gap-1', outgoing && 'justify-end')}>
            {message.reactions.map((reaction) => {
              const mine = reaction.userIds.includes(currentUserId);
              return (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => onToggleReaction(message.id, reaction.emoji)}
                  aria-pressed={mine}
                  aria-label={`${reaction.emoji} — ${reaction.userIds.length} نفر`}
                  className={cn(
                    'numeric inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-micro transition-colors',
                    mine
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                  )}
                >
                  <span aria-hidden="true">{reaction.emoji}</span>
                  {reaction.userIds.length}
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

interface FileCardProps {
  readonly attachment: Attachment;
  readonly caption: string | null;
  readonly outgoing: boolean;
}

function FileCard({ attachment, caption, outgoing }: FileCardProps) {
  const Icon = ATTACHMENT_ICONS[attachment.kind];

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'flex w-56 items-center gap-2.5 rounded-xl p-2 sm:w-64',
          outgoing ? 'bg-white/15' : 'bg-sunken',
        )}
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            outgoing ? 'bg-white/20 text-fg-on-brand' : 'bg-surface text-fg-brand',
          )}
        >
          <Icon size={20} variant="twotone" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-caption font-semibold">{attachment.name}</span>
          <span className={cn('numeric text-micro', outgoing ? 'text-fg-on-brand/70' : 'text-fg-tertiary')}>
            {formatFileSize(attachment.size)}
          </span>
        </span>
        <IconButton
          label={`دانلود ${attachment.name}`}
          icon={<DownloadIcon size={16} />}
          size="xs"
          className={outgoing ? 'text-fg-on-brand hover:bg-white/20' : undefined}
        />
      </div>
      {caption && <p className="text-body-sm leading-6">{caption}</p>}
      {attachment.kind === 'image' && (
        <Badge tone={outgoing ? 'neutral' : 'brand'} size="sm">
          پیش‌نمایش در مخزن پروژه
        </Badge>
      )}
    </div>
  );
}
