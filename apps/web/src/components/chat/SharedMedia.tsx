'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Attachment, AttachmentKind, Message } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { formatCount, formatFileSize, seededUnit } from '@/lib/format';
import { formatJalali, formatTime } from '@taskin/jalali';
import { describeLink, extractUrls, type SharedLink } from '@/lib/links';
import { downloadAttachment } from '@/lib/download';
import { useFileUrl } from '@/store/files';
import { userById } from '@/store/selectors';
import { Avatar, Button, EmptyState, IconButton, Modal, Tabs } from '@/components/ui';
import { StoredVoicePlayer } from './VoicePlayer';
import {
  ATTACHMENT_ICONS,
  DocumentIcon,
  DownloadIcon,
  ImageIcon,
  LinkIcon,
  MicrophoneIcon,
  PlayIcon,
} from '@/components/icons';

export type SharedMediaTab = 'files' | 'media' | 'audio' | 'links';

interface SharedFile {
  readonly message: Message;
  readonly attachment: Attachment;
}

interface SharedAudio {
  readonly message: Message;
  readonly durationSec: number;
  readonly waveform: readonly number[];
  readonly src: string | null;
  /** The stored file, played through a signed link when there is no local `src`. */
  readonly attachmentId: string | null;
  readonly name: string;
}

interface SharedLinkEntry {
  readonly message: Message;
  readonly link: SharedLink;
}

const MEDIA_KINDS: readonly AttachmentKind[] = ['image', 'video'];
const AUDIO_KINDS: readonly AttachmentKind[] = ['audio'];

/** 128 kbps: close enough to size an audio file's player when only its byte count is known. */
const AUDIO_BYTES_PER_SECOND = 16_000;

/** Deterministic pseudo-waveform for audio files, which (unlike voice memos) ship none. */
const syntheticWaveform = (seed: string): readonly number[] =>
  Array.from({ length: 40 }, (_, index) => Math.round((0.25 + seededUnit(`${seed}-${index}`) * 0.75) * 100) / 100);

/** Gradient backdrops for media without a stored preview; picked by name so a file keeps its look. */
const PREVIEW_GRADIENTS: readonly string[] = [
  'from-tag-blue to-tag-violet',
  'from-tag-teal to-tag-blue',
  'from-tag-pink to-tag-amber',
  'from-tag-green to-tag-teal',
  'from-tag-violet to-tag-pink',
];

/** Sorts a thread's shared content into the four drawer categories, newest first. */
function categorise(thread: readonly Message[]) {
  const files: SharedFile[] = [];
  const media: SharedFile[] = [];
  const audio: SharedAudio[] = [];
  const links: SharedLinkEntry[] = [];

  for (const message of thread) {
    const { body } = message;
    if (body.kind === 'voice') {
      audio.push({
        message,
        durationSec: body.durationSec,
        waveform: body.waveform.length > 0 ? body.waveform : syntheticWaveform(message.id),
        src: body.src,
        attachmentId: body.attachmentId ?? null,
        name: 'پیام صوتی',
      });
    } else if (body.kind === 'file') {
      const { attachment } = body;
      if (MEDIA_KINDS.includes(attachment.kind)) media.push({ message, attachment });
      else if (AUDIO_KINDS.includes(attachment.kind)) {
        audio.push({
          message,
          durationSec: Math.max(1, Math.round(attachment.size / AUDIO_BYTES_PER_SECOND)),
          waveform: syntheticWaveform(attachment.id),
          src: attachment.url,
          attachmentId: attachment.id,
          name: attachment.name,
        });
      } else files.push({ message, attachment });
      if (body.caption) for (const url of extractUrls(body.caption)) links.push({ message, link: describeLink(url) });
    } else if (body.kind === 'text') {
      for (const url of extractUrls(body.text)) links.push({ message, link: describeLink(url) });
    }
  }

  return { files: files.reverse(), media: media.reverse(), audio: audio.reverse(), links: links.reverse() };
}

const stamp = (message: Message): string => `${formatJalali(message.sentAt, 'day-month')}، ${formatTime(message.sentAt)}`;

/**
 * "فایل‌های مشترک" in the conversation drawer: one tab per content type — documents,
 * photos & videos, audio and links — each with its count and its own empty state.
 */
export function SharedMedia({ thread, load }: { readonly thread: readonly Message[]; readonly load?: () => Promise<readonly Message[]> }) {
  const [tab, setTab] = useState<SharedMediaTab>('files');
  const [preview, setPreview] = useState<SharedFile | null>(null);
  // Live, the server lists everything ever shared here (not only the loaded page of history);
  // it is asked again whenever the thread grows.
  const [remote, setRemote] = useState<readonly Message[] | null>(null);
  useEffect(() => {
    if (!load) return;
    let live = true;
    void load()
      .then((messages) => {
        if (live) setRemote(messages);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [load, thread.length]);
  const shared = useMemo(() => categorise(remote ?? thread), [remote, thread]);

  const total = shared.files.length + shared.media.length + shared.audio.length + shared.links.length;

  return (
    <section aria-labelledby="shared-media-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 id="shared-media-title" className="text-title-sm font-semibold text-fg-primary">
          فایل‌های مشترک
        </h3>
        <span className="numeric text-caption text-fg-tertiary">{formatCount(total)}</span>
      </div>

      <Tabs
        ariaLabel="دسته‌بندی محتوای مشترک"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'files', label: 'اسناد', count: formatCount(shared.files.length) },
          { value: 'media', label: 'تصویر و ویدیو', count: formatCount(shared.media.length) },
          { value: 'audio', label: 'صوت', count: formatCount(shared.audio.length) },
          { value: 'links', label: 'پیوندها', count: formatCount(shared.links.length) },
        ]}
      >
        {tab === 'files' && <FilesPanel files={shared.files} />}
        {tab === 'media' && <MediaPanel media={shared.media} onPreview={setPreview} />}
        {tab === 'audio' && <AudioPanel audio={shared.audio} />}
        {tab === 'links' && <LinksPanel links={shared.links} />}
      </Tabs>

      <MediaPreviewModal entry={preview} onClose={() => setPreview(null)} />
    </section>
  );
}

function FilesPanel({ files }: { readonly files: readonly SharedFile[] }) {
  if (files.length === 0) {
    return (
      <EmptyState
        compact
        icon={<DocumentIcon size={18} />}
        title="سندی به اشتراک گذاشته نشده"
        description="فایل‌های PDF، آفیس و آرشیوهای فشرده این گفتگو اینجا جمع می‌شوند."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {files.map(({ message, attachment }) => {
        const Icon = ATTACHMENT_ICONS[attachment.kind];
        const sender = userById(message.authorId);
        return (
          <li key={message.id} className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface p-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-brand">
              <Icon size={18} variant="twotone" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-caption font-semibold text-fg-primary" title={attachment.name}>
                {attachment.name}
              </span>
              <span className="numeric truncate text-micro text-fg-tertiary">
                {`${formatFileSize(attachment.size)}، ${sender?.fullName ?? ''}، ${stamp(message)}`}
              </span>
            </span>
            <IconButton
              label={`دانلود ${attachment.name}`}
              icon={<DownloadIcon size={16} />}
              size="xs"
              onClick={() => void downloadAttachment(attachment)}
            />
          </li>
        );
      })}
    </ul>
  );
}

function MediaThumb({ attachment, large = false }: { readonly attachment: Attachment; readonly large?: boolean }) {
  const Icon = ATTACHMENT_ICONS[attachment.kind];
  const gradient = PREVIEW_GRADIENTS[Math.floor(seededUnit(attachment.id) * PREVIEW_GRADIENTS.length)] ?? PREVIEW_GRADIENTS[0];
  const url = useFileUrl(attachment.kind === 'image' || (attachment.kind === 'video' && large) ? attachment : null, 'inline');

  if (url && attachment.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element -- user uploads of unknown dimensions
    return <img src={url} alt="" className="size-full object-cover" />;
  }
  if (url && attachment.kind === 'video' && large) {
    return <video src={url} controls className="size-full bg-black object-contain" />;
  }
  return (
    <span className={cn('flex size-full items-center justify-center bg-gradient-to-br text-white', gradient)}>
      <Icon size={large ? 40 : 22} className="drop-shadow-sm" />
    </span>
  );
}

function MediaPanel({
  media,
  onPreview,
}: {
  readonly media: readonly SharedFile[];
  readonly onPreview: (entry: SharedFile) => void;
}) {
  if (media.length === 0) {
    return (
      <EmptyState
        compact
        icon={<ImageIcon size={18} />}
        title="تصویر یا ویدیویی نیست"
        description="عکس‌ها، طرح‌ها و ویدیوهای این گفتگو به‌صورت شبکه‌ای اینجا نمایش داده می‌شوند."
      />
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {media.map((entry) => (
        <li key={entry.message.id}>
          <button
            type="button"
            onClick={() => onPreview(entry)}
            aria-label={`پیش‌نمایش ${entry.attachment.name}`}
            className="group/thumb relative block aspect-square w-full overflow-hidden rounded-lg border border-secondary"
          >
            <MediaThumb attachment={entry.attachment} />
            {entry.attachment.kind === 'video' && (
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <span className="flex size-8 items-center justify-center rounded-full bg-black/45 text-white">
                  <PlayIcon size={16} className="ms-0.5" />
                </span>
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-start text-[0.625rem] font-medium text-white opacity-0 transition-opacity group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100">
              {entry.attachment.name}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AudioPanel({ audio }: { readonly audio: readonly SharedAudio[] }) {
  if (audio.length === 0) {
    return (
      <EmptyState
        compact
        icon={<MicrophoneIcon size={18} />}
        title="پیام صوتی یا فایل صوتی نیست"
        description="پیام‌های صوتی و فایل‌های صوتی این گفتگو با پخش‌کننده کوچک اینجا قرار می‌گیرند."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {audio.map((entry) => {
        const sender = userById(entry.message.authorId);
        return (
          <li key={entry.message.id} className="flex flex-col gap-2 rounded-lg border border-secondary bg-surface p-2.5">
            <span className="flex items-center gap-2">
              {sender && (
                <Avatar name={sender.fullName} initials={sender.initials} tone={sender.avatarTone} size="xs" decorative />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-caption font-semibold text-fg-primary">{entry.name}</span>
                <span className="numeric truncate text-micro text-fg-tertiary">{`${sender?.fullName ?? ''}، ${stamp(entry.message)}`}</span>
              </span>
            </span>
            <StoredVoicePlayer
              variant="inline"
              attachmentId={entry.attachmentId}
              durationSec={entry.durationSec}
              waveform={entry.waveform}
              src={entry.src}
              outgoing={false}
              label={`${entry.name} از ${sender?.fullName ?? 'کاربر'}`}
            />
          </li>
        );
      })}
    </ul>
  );
}

function LinksPanel({ links }: { readonly links: readonly SharedLinkEntry[] }) {
  if (links.length === 0) {
    return (
      <EmptyState
        compact
        icon={<LinkIcon size={18} />}
        title="پیوندی به اشتراک گذاشته نشده"
        description="پیوندهایی که در پیام‌ها فرستاده می‌شوند به‌طور خودکار اینجا فهرست می‌شوند."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {links.map(({ message, link }, index) => {
        const sender = userById(message.authorId);
        return (
          <li key={`${message.id}-${index}`}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface p-2 transition-colors hover:border-brand"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
                <LinkIcon size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-caption font-semibold text-fg-primary">{link.title}</span>
                <span className="truncate text-micro text-fg-tertiary">
                  {`${link.siteName}، `}
                  <span className="latin-inline">{link.host}</span>
                </span>
                <span className="numeric truncate text-micro text-fg-quaternary">{`${sender?.fullName ?? ''}، ${stamp(message)}`}</span>
              </span>
              <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function MediaPreviewModal({ entry, onClose }: { readonly entry: SharedFile | null; readonly onClose: () => void }) {
  const sender = entry ? userById(entry.message.authorId) : undefined;
  return (
    <Modal
      open={entry !== null}
      onClose={onClose}
      size="lg"
      title={entry?.attachment.name ?? ''}
      description={
        entry ? `${formatFileSize(entry.attachment.size)}، ${sender?.fullName ?? ''}، ${stamp(entry.message)}` : undefined
      }
      icon={entry ? <ImageIcon size={20} /> : undefined}
      footer={
        entry ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              بستن
            </Button>
            <Button iconStart={<DownloadIcon size={18} />} onClick={() => void downloadAttachment(entry.attachment)}>
              دانلود
            </Button>
          </>
        ) : undefined
      }
    >
      {entry && (
        <div className="flex flex-col gap-3">
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-secondary">
            <MediaThumb attachment={entry.attachment} large />
          </div>
          {entry.message.body.kind === 'file' && entry.message.body.caption && (
            <p className="text-body-sm text-fg-secondary">{entry.message.body.caption}</p>
          )}
          {!entry.attachment.url && (
            <p className="text-caption text-fg-tertiary">
              پیش‌نمایش کامل پس از بارگذاری فایل روی سرور در دسترس است؛ در این نسخه نمایشی تصویر جایگزین نشان داده می‌شود.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
