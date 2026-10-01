'use client';

import { useMemo, useState } from 'react';
import type { Attachment, LinkPreview, Message, SharedMediaTab } from '@/types';
import { cn } from '@/lib/cn';
import { formatJalali } from '@/lib/jalali';
import { formatCount, formatFileSize, seededUnit } from '@/lib/format';
import { conversationLinks, conversationMessages, userById } from '@/store/selectors';
import { Badge, EmptyState, IconButton, Modal, SegmentedControl } from '@/components/ui';
import { VoicePlayer } from './VoicePlayer';
import {
  ArchiveIcon,
  DocumentIcon,
  DownloadIcon,
  ImageIcon,
  LinkIcon,
  MicrophoneIcon,
  SheetIcon,
} from '@/components/icons';

export interface SharedMediaDrawerProps {
  readonly conversationId: string;
  readonly messages: readonly Message[];
}

const DOC_ICONS = {
  document: DocumentIcon,
  sheet: SheetIcon,
  archive: ArchiveIcon,
  image: ImageIcon,
  audio: DocumentIcon,
  link: LinkIcon,
} as const;

interface SharedFile {
  readonly message: Message;
  readonly attachment: Attachment;
}

/**
 * Shared-media drawer.
 *
 * Four tabs over one thread: media, documents, voice notes and links. Each tab counts its own
 * contents in the segmented control, so an empty tab is visible before it is opened rather
 * than after.
 */
export function SharedMediaDrawer({ conversationId, messages }: SharedMediaDrawerProps) {
  const [tab, setTab] = useState<SharedMediaTab>('media');
  const [lightbox, setLightbox] = useState<SharedFile | null>(null);

  const thread = useMemo(
    () => conversationMessages(messages, conversationId),
    [messages, conversationId],
  );

  const files = useMemo<readonly SharedFile[]>(
    () =>
      thread
        .flatMap((message) =>
          message.body.kind === 'file' ? [{ message, attachment: message.body.attachment }] : [],
        )
        .reverse(),
    [thread],
  );

  const media = files.filter((entry) => entry.attachment.kind === 'image');
  const docs = files.filter((entry) => entry.attachment.kind !== 'image');
  const voices = useMemo(
    () => thread.filter((message) => message.body.kind === 'voice').reverse(),
    [thread],
  );
  const links = useMemo(() => conversationLinks(messages, conversationId), [messages, conversationId]);

  return (
    <section aria-label="فایل‌های مشترک گفتگو" className="flex flex-col gap-3">
      <h3 className="text-title-sm font-semibold text-fg-primary">فایل‌های مشترک</h3>

      <SegmentedControl
        ariaLabel="دسته‌بندی فایل‌های مشترک"
        fullWidth
        value={tab}
        onValueChange={setTab}
        options={[
          { value: 'media', label: 'رسانه‌ها', count: formatCount(media.length) },
          { value: 'docs', label: 'اسناد', count: formatCount(docs.length) },
          { value: 'voice', label: 'صوت‌ها', count: formatCount(voices.length) },
          { value: 'links', label: 'پیوندها', count: formatCount(links.length) },
        ]}
      />

      {tab === 'media' &&
        (media.length === 0 ? (
          <EmptyTab icon={<ImageIcon size={20} />} title="رسانه‌ای به اشتراک گذاشته نشده" />
        ) : (
          <ul className="grid grid-cols-3 gap-1.5">
            {media.map((entry) => (
              <li key={entry.message.id}>
                <button
                  type="button"
                  onClick={() => setLightbox(entry)}
                  aria-label={`نمایش ${entry.attachment.name}`}
                  className="group/tile relative aspect-square w-full overflow-hidden rounded-lg border border-secondary bg-sunken transition-colors hover:border-brand"
                >
                  {/*
                    No binary assets ship with this build, so a deterministic gradient stands
                    in for the thumbnail — stable per file rather than random on each render.
                  */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(${Math.round(seededUnit(entry.attachment.id) * 360)}deg, rgb(var(--brand-300)), rgb(var(--brand-600)))`,
                    }}
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gray-900/70 px-1.5 py-1 text-[0.625rem] text-white">
                    {entry.attachment.name}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center text-white/90 opacity-0 transition-opacity group-hover/tile:opacity-100">
                    <ImageIcon size={22} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'docs' &&
        (docs.length === 0 ? (
          <EmptyTab icon={<DocumentIcon size={20} />} title="سندی به اشتراک گذاشته نشده" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {docs.map((entry) => {
              const Icon = DOC_ICONS[entry.attachment.kind];
              const sender = userById(entry.message.authorId);
              return (
                <li
                  key={entry.message.id}
                  className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface p-2"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-brand">
                    <Icon size={18} variant="twotone" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-caption font-semibold text-fg-primary">
                      {entry.attachment.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge tone="neutral" size="sm" numeric>
                        {formatFileSize(entry.attachment.size)}
                      </Badge>
                      <Badge tone="neutral" size="sm" numeric>
                        {formatJalali(entry.message.sentAt, 'day-month')}
                      </Badge>
                      {sender && (
                        <span className="truncate text-micro text-fg-tertiary">{sender.fullName}</span>
                      )}
                    </span>
                  </span>
                  <IconButton
                    label={`دانلود ${entry.attachment.name}`}
                    icon={<DownloadIcon size={16} />}
                    size="xs"
                  />
                </li>
              );
            })}
          </ul>
        ))}

      {tab === 'voice' &&
        (voices.length === 0 ? (
          <EmptyTab icon={<MicrophoneIcon size={20} />} title="پیام صوتی‌ای وجود ندارد" />
        ) : (
          <ul className="flex flex-col gap-2">
            {voices.map((message) => {
              const sender = userById(message.authorId);
              if (message.body.kind !== 'voice') return null;
              return (
                <li
                  key={message.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-secondary bg-surface p-2.5"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-caption font-semibold text-fg-primary">
                      {sender?.fullName ?? 'کاربر'}
                    </span>
                    <span className="numeric ms-auto text-micro text-fg-tertiary">
                      {formatJalali(message.sentAt, 'day-month')}
                    </span>
                  </span>
                  <VoicePlayer
                    durationSec={message.body.durationSec}
                    waveform={message.body.waveform}
                    src={message.body.src}
                    outgoing={false}
                    label={`پیام صوتی ${sender?.fullName ?? ''}`}
                  />
                </li>
              );
            })}
          </ul>
        ))}

      {tab === 'links' &&
        (links.length === 0 ? (
          <EmptyTab icon={<LinkIcon size={20} />} title="پیوندی در این گفتگو نیست" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {links.map((link) => (
              <LinkRow key={`${link.messageId}-${link.url}`} link={link} />
            ))}
          </ul>
        ))}

      <Modal
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        size="lg"
        title={lightbox?.attachment.name ?? ''}
        description={
          lightbox
            ? `${formatFileSize(lightbox.attachment.size)}، ${formatJalali(lightbox.message.sentAt, 'medium')}`
            : undefined
        }
        icon={<ImageIcon size={20} variant="twotone" />}
      >
        {lightbox && (
          <div className="flex flex-col gap-3">
            <div
              className="flex aspect-video w-full items-center justify-center rounded-xl"
              style={{
                background: `linear-gradient(${Math.round(seededUnit(lightbox.attachment.id) * 360)}deg, rgb(var(--brand-300)), rgb(var(--brand-600)))`,
              }}
            >
              <ImageIcon size={48} className="text-white/80" />
            </div>
            <p className="text-center text-caption text-fg-tertiary">
              پیش‌نمایش نمادین است؛ در این نسخه فایل‌های باینری همراه مخزن ارسال نمی‌شوند.
            </p>
          </div>
        )}
      </Modal>
    </section>
  );
}

function EmptyTab({ icon, title }: { readonly icon: React.ReactNode; readonly title: string }) {
  return (
    <EmptyState
      compact
      icon={icon}
      title={title}
      description="هر چیزی که در این گفتگو به اشتراک گذاشته شود اینجا دسته‌بندی می‌شود."
    />
  );
}

function LinkRow({ link }: { readonly link: LinkPreview }) {
  const sender = userById(link.sharedById);
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface p-2">
      {/*
        A real favicon needs a network fetch this build cannot make, so the host's initial
        stands in — deterministic and offline-safe.
      */}
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-body-sm font-bold uppercase text-fg-brand"
      >
        {link.host.charAt(0)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-caption font-semibold text-fg-primary">{link.title}</span>
        <span className="latin-inline truncate text-micro text-fg-tertiary">{link.host}</span>
        <span className="numeric truncate text-micro text-fg-quaternary">
          {`${sender?.fullName ?? ''}، ${formatJalali(link.sharedAt, 'day-month')}`}
        </span>
      </span>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`باز کردن ${link.title}`}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-tertiary',
          'transition-colors hover:bg-hover hover:text-fg-brand',
        )}
      >
        <LinkIcon size={16} />
      </a>
    </li>
  );
}
