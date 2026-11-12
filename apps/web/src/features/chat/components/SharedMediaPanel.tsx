'use client';

import { stamp } from '@/features/chat/lib/shared-media';

import type { Attachment } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { formatFileSize,seededUnit } from '@/lib/format';
import { downloadAttachment } from '@/lib/download';
import { useFileUrl } from '@/store/files';
import { userById } from '@/store/selectors';
import { Button,Modal } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import {
ATTACHMENT_ICONS,DownloadIcon,
ImageIcon,PlayIcon
} from '@/components/icons';

import type { SharedFile } from '@/features/chat/types/shared-media';

/** Gradient backdrops for media without a stored preview; picked by name so a file keeps its look. */
const PREVIEW_GRADIENTS: readonly string[] = [
  'from-tag-blue to-tag-violet',
  'from-tag-teal to-tag-blue',
  'from-tag-pink to-tag-amber',
  'from-tag-green to-tag-teal',
  'from-tag-violet to-tag-pink',
];

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

export function MediaPanel({
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

export function MediaPreviewModal({ entry, onClose }: { readonly entry: SharedFile | null; readonly onClose: () => void }) {
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
