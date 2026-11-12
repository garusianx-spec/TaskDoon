'use client';

import { formatFileSize } from '@/lib/format';
import { IconButton,Input } from '@/components/ui';
import {
CloseIcon,PaperclipIcon
} from '@/components/icons';
import { type CreateTaskForm } from '@/features/tasks/hooks/useCreateTaskForm';

export function TaskCreateFiles({ model }: { readonly model: CreateTaskForm }) {
  const { form, files, fileError, saving, pickFiles, setSubmitError, setFiles } = model;
  return (
    <>
      {form.attachments.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-fg-secondary">پیوست‌های منتقل‌شده</span>
          <ul className="flex flex-col gap-1.5">
            {form.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center gap-2.5 rounded-lg border border-secondary bg-sunken p-2"
              >
                <PaperclipIcon size={16} className="shrink-0 text-fg-quaternary" />
                <span className="flex-1 truncate text-caption font-medium text-fg-primary">
                  {attachment.name}
                </span>
                <span className="numeric text-micro text-fg-tertiary">
                  {formatFileSize(attachment.size)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2">
        <Input
          label="افزودن پیوست"
          type="file"
          multiple
          onChange={(event) => {
            pickFiles(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
          hint="می‌توانید چند فایل انتخاب کنید. فایل‌ها هنگام ثبت وظیفه بارگذاری می‌شوند."
          error={fileError ?? undefined}
          className="h-auto py-2 file:me-3 file:rounded-md file:border-0 file:bg-sunken file:px-2 file:py-1 file:text-caption file:text-fg-secondary"
        />
        {files.length > 0 && (
          <ul aria-label="فایل‌های انتخاب‌شده" className="flex min-w-0 flex-col gap-1.5">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-secondary bg-sunken p-2">
                <PaperclipIcon size={16} className="shrink-0 text-fg-quaternary" />
                <span className="min-w-0 flex-1 truncate text-caption font-medium text-fg-primary">{file.name}</span>
                <span className="numeric shrink-0 text-micro text-fg-tertiary">{formatFileSize(file.size)}</span>
                <IconButton
                  label={`حذف پیوست «${file.name}»`}
                  icon={<CloseIcon size={14} />}
                  size="xs"
                  onClick={() => { setSubmitError(null); setFiles((current) => current.filter((_, position) => position !== index)); }}
                />
              </li>
            ))}
          </ul>
        )}
        {saving && files.length > 0 && <p role="status" className="text-caption text-fg-secondary">در حال بارگذاری پیوست‌ها و ثبت وظیفه…</p>}
      </div>
    </>
  );
}
