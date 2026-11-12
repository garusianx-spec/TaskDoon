'use client';

import { useRef } from 'react';
import type { Task } from '@taskin/contracts';
import { formatJalali } from '@taskin/jalali';
import { downloadAttachment } from '@/lib/download';
import { formatCount,formatFileSize } from '@/lib/format';
import { userById } from '@/store/selectors';
import {
Button,
IconButton
} from '@/components/ui';
import {
DownloadIcon,PaperclipIcon,TrashIcon,ATTACHMENT_ICONS
} from '@/components/icons';
import { type TaskInspectorProps } from '@/features/tasks/types/inspector';

export function TaskInspectorFiles({ attachments, fileBusy, saving, onAttachFiles, onRemoveAttachment, changeFiles, setError }: { readonly attachments: Task["attachments"]; readonly fileBusy: boolean; readonly saving: boolean; readonly onAttachFiles: TaskInspectorProps["onAttachFiles"]; readonly onRemoveAttachment: TaskInspectorProps["onRemoveAttachment"]; readonly changeFiles: (operation: () => Promise<void> | void) => Promise<void>; readonly setError: (error: string) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <section aria-label="مخزن فایل وظیفه">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-title-sm font-semibold text-fg-primary">فایل‌ها</h3>
        <span className="numeric text-caption text-fg-tertiary">
          {formatCount(attachments.length)}
        </span>
        <Button
          size="xs"
          variant="secondary"
          className="ms-auto"
          iconStart={<PaperclipIcon size={14} />}
          onClick={() => fileRef.current?.click()}
          disabled={!onAttachFiles || fileBusy || saving}
        >
          پیوست فایل
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="انتخاب فایل برای پیوست به وظیفه"
          data-testid="task-file-input"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.some((file) => file.size === 0)) {
              setError('فایل خالی قابل پیوست نیست؛ یک فایل دارای محتوا انتخاب کنید.');
              return;
            }
            if (files.length > 0 && onAttachFiles) void changeFiles(() => onAttachFiles(files));
          }}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-primary px-3 py-4 text-center text-caption text-fg-tertiary">
          هنوز فایلی به این وظیفه پیوست نشده است.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((attachment) => {
            const Icon = ATTACHMENT_ICONS[attachment.kind];
            const uploader = userById(attachment.uploadedById);
            return (
              <li
                key={attachment.id}
                className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface p-2"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-brand">
                  <Icon size={18} variant="twotone" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-caption font-semibold text-fg-primary">
                    {attachment.name}
                  </span>
                  <span className="numeric truncate text-micro text-fg-tertiary">
                    {`${formatFileSize(attachment.size)}، ${uploader?.fullName ?? ''}، ${formatJalali(attachment.uploadedAt, 'day-month')}`}
                  </span>
                </span>
                <IconButton
                  label={`دانلود ${attachment.name}`}
                  icon={<DownloadIcon size={16} />}
                  size="xs"
                  onClick={() => void downloadAttachment(attachment)}
                />
                <IconButton
                  label={`حذف ${attachment.name}`}
                  icon={<TrashIcon size={16} />}
                  size="xs"
                  className="hover:text-status-blocked"
                  onClick={() => { if (onRemoveAttachment) void changeFiles(() => onRemoveAttachment(attachment.id)); }}
                  disabled={!onRemoveAttachment || fileBusy || saving}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
