'use client';

import { useState } from 'react';
import type { MessageView } from '@taskin/contracts';
import { formatDuration } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { dateTimeLabel } from '@/admin/format';
import { problemMessage } from '@/api/messages';
import { formatFileSize } from '@/lib/format';
import { Badge, Button } from '@/components/ui';
import { DocumentIcon, ImageIcon, MicrophoneIcon } from '@/components/icons';

/** `<@userId>` mention tokens as `@name`. */
function withMentions(text: string, authors: Readonly<Record<string, string>>): string {
  return text.replace(/<@([0-9a-f-]{36})>/gi, (_, id: string) => `@${authors[id] ?? 'کاربر'}`);
}

/**
 * One message as the inspector shows it. Files are fetched only when asked for, through the
 * admin link endpoint, so each one opened is recorded in the audit log.
 */
export function MessageItem({ message, authors, targetUserId }: { readonly message: MessageView; readonly authors: Readonly<Record<string, string>>; readonly targetUserId: string | null }) {
  const author = message.authorId ? (authors[message.authorId] ?? 'عضو سابق') : 'سیستم';
  const highlighted = targetUserId !== null && message.authorId === targetUserId;
  return (
    <li className={`rounded-lg border px-3 py-2 ${highlighted ? 'border-brand bg-brand-subtle/40' : 'border-secondary'}`}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-tertiary">
        <span className="font-semibold text-fg-primary">{author}</span>
        <time dateTime={message.createdAt}>{dateTimeLabel(message.createdAt)}</time>
        {message.editedAt && <span>(ویرایش‌شده)</span>}
        {message.linkedTaskId && <Badge size="sm">تبدیل‌شده به وظیفه</Badge>}
      </div>
      {message.deleted ? (
        <p className="text-body-sm italic text-fg-tertiary">این پیام حذف شده است.</p>
      ) : message.kind === 'system' ? (
        <p className="text-body-sm italic text-fg-tertiary">پیام سیستمی</p>
      ) : (
        <>
          {message.text && (
            <p dir="auto" className="whitespace-pre-wrap break-words text-body-sm text-fg-primary">
              {withMentions(message.text, authors)}
            </p>
          )}
          {message.attachment && <Attachment message={message} targetUserId={targetUserId} />}
        </>
      )}
    </li>
  );
}

function Attachment({ message, targetUserId }: { readonly message: MessageView; readonly targetUserId: string | null }) {
  const { call } = useAdmin();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachment = message.attachment;
  if (!attachment) return null;
  const voice = message.kind === 'voice';
  const image = attachment.kind === 'image';
  const duration = typeof message.meta === 'object' && message.meta !== null && 'durationSec' in message.meta ? Number(message.meta.durationSec) : null;

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await call(() => adminApi.attachmentLink(attachment.id, targetUserId));
      setUrl(link.url);
      if (!voice && !image) window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const Icon = voice ? MicrophoneIcon : image ? ImageIcon : DocumentIcon;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-body-sm">
        <Icon size={18} className="shrink-0 text-fg-tertiary" />
        <span className="min-w-0 flex-1 truncate" dir="auto">
          {voice ? `پیام صوتی${duration ? ` — ${formatDuration(duration)}` : ''}` : attachment.name}
        </span>
        <span className="text-caption text-fg-tertiary">{formatFileSize(attachment.size)}</span>
        {!url || (!voice && !image) ? (
          <Button variant="secondary" size="xs" loading={busy} onClick={() => void open()}>
            {voice ? 'پخش' : image ? 'نمایش تصویر' : 'باز کردن فایل'}
          </Button>
        ) : null}
      </div>
      {url && voice && <audio controls autoPlay src={url} className="w-full max-w-md" aria-label="پخش پیام صوتی" />}
      {url && image && (
        // A short-lived link from the object store: not something next/image can optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={attachment.name} className="max-h-80 max-w-full self-start rounded-lg border border-secondary object-contain" />
      )}
      {error && (
        <p role="alert" className="text-caption text-status-blocked">
          {error}
        </p>
      )}
    </div>
  );
}
