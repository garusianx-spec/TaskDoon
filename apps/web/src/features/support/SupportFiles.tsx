'use client';
import { useRef, type DragEvent } from 'react';
import { useNamespacedId } from '@/hooks/useId';
import { Button } from '@/components/ui';
import { queueSupportFiles, supportFileError, type QueuedSupportFile } from './support-client';
export function SupportFiles({
  files,
  onChange,
  onError,
  disabled = false,
}: {
  files: QueuedSupportFile[];
  onChange: (files: QueuedSupportFile[]) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useNamespacedId('support-files-');
  const add = (incoming: File[]) => {
    const combined = [...files, ...queueSupportFiles(incoming)];
    const error = supportFileError(combined.map((f) => f.file));
    if (error) onError(error);
    else {
      onError('');
      onChange(combined);
    }
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) add(Array.from(e.dataTransfer.files));
  };
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-dashed border-primary p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={drop}
    >
      <label htmlFor={id} className="text-body-sm font-medium">
        پیوست‌ها
        <input
          ref={input}
          id={id}
          tabIndex={-1}
          className="sr-only"
          aria-describedby={`${id}-hint`}
          type="file"
          multiple
          disabled={disabled}
          accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </label>
      <Button
        variant="secondary"
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onClick={() => input.current?.click()}
      >
        انتخاب فایل
      </Button>
      <p id={`${id}-hint`} className="text-caption text-fg-tertiary">
        فایل را رها کنید یا انتخاب کنید؛ حداکثر ۵ فایل، هر فایل تا ۱۰ مگابایت.
      </p>
      {files.map((item, index) => (
        <div className="flex min-w-0 items-center justify-between gap-2" key={item.commandId}>
          <span className="break-all text-body-sm">
            <bdi>{item.file.name}</bdi> ·{' '}
            {new Intl.NumberFormat('fa-IR').format(Math.ceil(item.file.size / 1024))} کیلوبایت
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`حذف ${item.file.name} از پیوست‌های ارسال‌نشده`}
            onClick={() => onChange(files.filter((_, i) => i !== index))}
          >
            برداشتن
          </Button>
        </div>
      ))}
    </div>
  );
}
