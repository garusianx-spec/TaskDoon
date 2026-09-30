'use client';

import { useRef, useState } from 'react';
import type { Attachment, Message, User } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { QUICK_REACTIONS } from '@/data/reference';
import { downloadAttachment } from '@/lib/download';
import { useFileUrl } from '@/store/files';
import { formatCount, formatFileSize } from '@/lib/format';
import { Avatar, Badge, Button, ClockTime, IconButton, Popover, Tooltip } from '@/components/ui';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { StoredVoicePlayer } from './VoicePlayer';
import {
  ConvertToTaskIcon,
  CopyIcon,
  DoubleCheckIcon,
  DownloadIcon,
  EmojiIcon,
  MoreHorizontalIcon,
  RefreshIcon,
  ReplyIcon,
  TaskSquareIcon,
  TrashIcon,
  WarningIcon,
  ATTACHMENT_ICONS,
} from '@/components/icons';



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
  /** An unsent message of this member's (`message.failed`): send it again, or let it go. */
  readonly onResend?: (messageId: string) => void;
  readonly onDiscard?: (messageId: string) => void;
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
  onResend,
  onDiscard,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  if (message.body.kind === 'system') return <SystemLine text={message.body.text} />;

  const startLongPress = () => {
    // An unsent message offers only its own two actions, shown under it.
    if (message.failed) return;
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
        if (!message.failed) onLongPress(message);
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
            <ClockTime iso={message.sentAt} className="numeric text-micro text-fg-quaternary" />
          </div>
        )}

        <div className={cn('flex items-center gap-1', outgoing ? 'flex-row-reverse' : 'flex-row')}>
          <div
            className={cn(
              'relative min-w-0 rounded-2xl px-3.5 py-2.5 shadow-xs',
              outgoing
                ? 'rounded-se-sm bg-brand-solid text-fg-on-brand'
                : 'rounded-ss-sm border border-secondary bg-surface text-fg-primary',
            )}
          >
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
              <StoredVoicePlayer
                durationSec={message.body.durationSec}
                waveform={message.body.waveform}
                src={message.body.src}
                attachmentId={message.body.attachmentId ?? null}
                outgoing={outgoing}
                label={`پیام صوتی ${author.fullName}`}
              />
            )}

            {message.body.kind === 'file' &&
              (message.body.attachment.kind === 'image' && !message.body.asFile ? (
                <PhotoCard attachment={message.body.attachment} caption={message.body.caption} outgoing={outgoing} />
              ) : (
                // A picture sent as a file is a document like any other: no inline preview.
                <FileCard attachment={message.body.attachment} caption={message.body.caption} outgoing={outgoing} preview={!message.body.asFile} />
              ))}

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
              <ClockTime
                iso={message.sentAt}
                className={cn('numeric text-micro', outgoing ? 'text-fg-on-brand/70' : 'text-fg-quaternary')}
              />
              {outgoing &&
                (message.failed ? (
                  <WarningIcon size={14} className="text-white" label="ارسال نشد" />
                ) : (
                  <DoubleCheckIcon
                    size={14}
                    className={message.readByIds.length > 0 ? 'text-white' : 'text-fg-on-brand/60'}
                    label={message.readByIds.length > 0 ? 'خوانده شد' : 'ارسال شد'}
                  />
                ))}
            </div>
          </div>

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
        </div>

        {message.failed && (
          <div role="group" aria-label="پیام ارسال نشد" className={cn('flex flex-wrap items-center gap-1.5', outgoing && 'justify-end')}>
            <span className="inline-flex items-center gap-1 text-caption font-medium text-status-blocked">
              <WarningIcon size={14} />
              ارسال نشد
            </span>
            {onResend && (
              <Button size="xs" variant="secondary" iconStart={<RefreshIcon size={14} />} onClick={() => onResend(message.id)}>
                ارسال دوباره
              </Button>
            )}
            {onDiscard && (
              <Button size="xs" variant="ghost" iconStart={<TrashIcon size={14} />} onClick={() => onDiscard(message.id)}>
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
                  onClick={() => onToggleReaction(message.id, reaction.emoji)}
                  aria-pressed={mine}
                  aria-label={`${reaction.emoji} — ${formatCount(reaction.userIds.length)} نفر`}
                  className={cn(
                    'numeric inline-flex animate-scale-in items-center gap-1 rounded-full border px-1.5 py-0.5 text-micro transition-colors',
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

/** A line the system wrote into the conversation (a group created, a message turned into a task). */
export function SystemLine({ text }: { readonly text: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-full bg-sunken px-3 py-1 text-micro text-fg-tertiary">{text}</span>
    </div>
  );
}

interface FileCardProps {
  readonly attachment: Attachment;
  readonly caption: string | null;
  readonly outgoing: boolean;
  /** Show a picture under its card; off for a picture sent as a file. */
  readonly preview?: boolean;
}

function FileCard({ attachment, caption, outgoing, preview = true }: FileCardProps) {
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
          onClick={() => void downloadAttachment(attachment)}
          className={outgoing ? 'text-fg-on-brand hover:bg-white/20' : undefined}
        />
      </div>
      {caption && <p className="text-body-sm leading-6">{caption}</p>}
      {preview && attachment.kind === 'image' && <ImagePreview attachment={attachment} outgoing={outgoing} />}
    </div>
  );
}

/**
 * A picture sent as a photo: the picture itself, with its caption under it and a download
 * button over its corner. Until there is a link to its bytes (none for the demo's fixtures) it
 * shows as a file card.
 */
function PhotoCard({ attachment, caption, outgoing }: Omit<FileCardProps, 'preview'>) {
  const url = useFileUrl(attachment, 'inline');
  if (!url) return <FileCard attachment={attachment} caption={caption} outgoing={outgoing} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link to an upload */}
        <img src={url} alt={attachment.name} loading="lazy" className="max-h-80 w-60 rounded-lg bg-sunken object-cover sm:w-72" />
        <IconButton
          label={`دانلود ${attachment.name}`}
          icon={<DownloadIcon size={16} />}
          size="xs"
          onClick={() => void downloadAttachment(attachment)}
          className="absolute bottom-1.5 end-1.5 bg-black/45 text-white hover:bg-black/60"
        />
      </div>
      {caption && <p className="whitespace-pre-wrap break-words text-body-sm leading-6">{caption}</p>}
    </div>
  );
}

/** The picture itself once there is a link to it; the demo's fixtures (no bytes) keep a badge. */
function ImagePreview({ attachment, outgoing }: { readonly attachment: Attachment; readonly outgoing: boolean }) {
  const url = useFileUrl(attachment, 'inline');
  if (!url) {
    return (
      <Badge tone={outgoing ? 'neutral' : 'brand'} size="sm">
        پیش‌نمایش در مخزن پروژه
      </Badge>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link to an upload
  return <img src={url} alt={attachment.name} loading="lazy" className="max-h-56 w-56 rounded-lg object-cover sm:w-64" />;
}
