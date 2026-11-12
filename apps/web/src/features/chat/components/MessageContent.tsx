'use client';

import { cn } from '@/lib/utils';
import { ClockTime } from '@/components/ui';
import { StoredVoicePlayer } from '@/features/chat/components/VoicePlayer';
import { DoubleCheckIcon, WarningIcon } from '@/components/icons';
import { FileCard, PhotoCard } from '@/features/chat/components/MessageAttachments';
import { type MessageBubbleProps } from '@/features/chat/types/message-bubble';

export function MessageContent({
  message,
  outgoing,
  author,
  repliedTo,
}: Pick<MessageBubbleProps, 'message' | 'outgoing' | 'author' | 'repliedTo'>) {
  return (
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
          <PhotoCard
            attachment={message.body.attachment}
            caption={message.body.caption}
            outgoing={outgoing}
          />
        ) : (
          // A picture sent as a file is a document like any other: no inline preview.
          <FileCard
            attachment={message.body.attachment}
            caption={message.body.caption}
            outgoing={outgoing}
            preview={!message.body.asFile}
          />
        ))}

      <div className={cn('mt-1 flex items-center gap-1', outgoing ? 'justify-start' : 'justify-end')}>
        {message.edited && (
          <span className={cn('text-micro', outgoing ? 'text-fg-on-brand/70' : 'text-fg-quaternary')}>
            ویرایش‌شده
          </span>
        )}
        <ClockTime
          iso={message.sentAt}
          className={cn('text-micro numeric', outgoing ? 'text-fg-on-brand/70' : 'text-fg-quaternary')}
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
  );
}
