'use client';

import { stamp } from '@/features/chat/lib/shared-media';

import { formatFileSize } from '@/lib/format';
import { downloadAttachment } from '@/lib/download';
import { userById } from '@/store/selectors';
import { IconButton } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { ATTACHMENT_ICONS, DocumentIcon, DownloadIcon } from '@/components/icons';

import type { SharedFile } from '@/features/chat/types/shared-media';

export function FilesPanel({ files }: { readonly files: readonly SharedFile[] }) {
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
          <li
            key={message.id}
            className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface p-2"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-brand">
              <Icon size={18} variant="twotone" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-caption font-semibold text-fg-primary" title={attachment.name}>
                {attachment.name}
              </span>
              <span className="truncate text-micro text-fg-tertiary numeric">
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
