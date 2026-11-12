'use client';

import type { Attachment } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { downloadAttachment } from '@/lib/download';
import { useFileUrl } from '@/store/files';
import { formatFileSize } from '@/lib/format';
import { Badge,IconButton } from '@/components/ui';
import {
DownloadIcon,ATTACHMENT_ICONS
} from '@/components/icons';


interface FileCardProps {
  readonly attachment: Attachment;
  readonly caption: string | null;
  readonly outgoing: boolean;
  /** Show a picture under its card; off for a picture sent as a file. */
  readonly preview?: boolean;
}

export function FileCard({ attachment, caption, outgoing, preview = true }: FileCardProps) {
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
export function PhotoCard({ attachment, caption, outgoing }: Omit<FileCardProps, 'preview'>) {
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
