'use client';

import { useEffect, useRef, useState } from 'react';
import { toPersianDigits } from '@taskin/jalali';
import { attachmentKindOf } from '@/lib/attachments';
import { formatCount, formatFileSize } from '@/lib/format';
import { compressPhoto, isImageFile } from '@/lib/image-compress';
import { Button, Checkbox, IconButton, Input, Modal } from '@/components/ui';
import { AddIcon, ATTACHMENT_ICONS, PaperclipIcon, TrashIcon } from '@/components/icons';

/** One file as it leaves the preview: a photo already re-encoded, unless it goes "as a file". */
export interface OutgoingFile {
  readonly file: File;
  readonly caption: string | null;
  /** A picture sent as a document: its original bytes, shown as a download card. */
  readonly asFile: boolean;
}

export interface AttachmentPreviewModalProps {
  /** The files waiting to be sent; the preview is open while there are any. */
  readonly files: readonly File[];
  readonly onFilesChange: (files: readonly File[]) => void;
  readonly onSend: (items: readonly OutgoingFile[]) => void;
  /** Largest file accepted, in bytes. */
  readonly maxBytes: number;
}

/**
 * The step between picking (or dropping) files and sending them, as in Telegram: each file with
 * its thumbnail, name and size, and a way to take it out; «افزودن فایل» for more; one caption,
 * under the first picture (the last file when there is none); and «ارسال تصویر به صورت فایل»,
 * which sends pictures as they are instead of as compressed photos.
 */
export function AttachmentPreviewModal({ files, onFilesChange, onSend, maxBytes }: AttachmentPreviewModalProps) {
  const [caption, setCaption] = useState('');
  const [asFile, setAsFile] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);
  const open = files.length > 0;
  const hasImages = files.some(isImageFile);

  // A fresh preview each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setCaption('');
      setAsFile(false);
      setPreparing(false);
      setError(null);
    }
  }

  const close = () => onFilesChange([]);

  const add = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (picked.length === 0) return;
    const tooBig = picked.some((file) => file.size > maxBytes);
    setError(tooBig ? `حجم هر فایل باید کمتر از ${toPersianDigits(Math.round(maxBytes / (1024 * 1024)))} مگابایت باشد.` : null);
    const accepted = picked.filter((file) => file.size > 0 && file.size <= maxBytes);
    if (accepted.length > 0) onFilesChange([...files, ...accepted]);
  };

  const send = async () => {
    if (preparing) return;
    setPreparing(true);
    const text = caption.trim() || null;
    // Photos are re-encoded here, before any upload is asked for; everything else goes as it is.
    const prepared = await Promise.all(files.map((file) => (!asFile && isImageFile(file) ? compressPhoto(file) : Promise.resolve(file))));
    // The caption belongs to the (first) picture; with none, to the last file.
    const firstImage = files.findIndex(isImageFile);
    const captioned = firstImage >= 0 ? firstImage : files.length - 1;
    onSend(prepared.map((file, index) => ({ file, caption: index === captioned ? text : null, asFile: asFile && isImageFile(file) })));
    onFilesChange([]);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="ارسال پیوست"
      description={`${formatCount(files.length)} فایل آماده ارسال`}
      icon={<PaperclipIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            انصراف
          </Button>
          <Button onClick={() => void send()} loading={preparing}>
            ارسال
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul aria-label="فایل‌های پیوست" className="flex flex-col gap-2">
          {files.map((file, index) => (
            <li key={`${index}-${file.name}-${file.size}`} className="flex items-center gap-3 rounded-xl border border-secondary bg-sunken p-2">
              <Thumbnail file={file} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm font-semibold text-fg-primary">{file.name}</span>
                <span className="numeric text-caption text-fg-tertiary">{formatFileSize(file.size)}</span>
              </span>
              <IconButton
                label={`حذف ${file.name}`}
                icon={<TrashIcon size={16} />}
                size="xs"
                onClick={() => onFilesChange(files.filter((_, at) => at !== index))}
              />
            </li>
          ))}
        </ul>

        <div>
          <Button variant="secondary" size="sm" iconStart={<AddIcon size={16} />} onClick={() => addRef.current?.click()}>
            افزودن فایل
          </Button>
          <input
            ref={addRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label="انتخاب فایل‌های بیشتر"
            data-testid="attachment-add-input"
            onChange={(event) => {
              add(event.target.files);
              event.target.value = '';
            }}
          />
          {error && (
            <p role="alert" className="mt-1.5 text-caption text-status-blocked">
              {error}
            </p>
          )}
        </div>

        <Input
          label="عنوان پیوست"
          hideLabel
          value={caption}
          maxLength={1000}
          onChange={(event) => setCaption(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="درج عنوان برای تصویر..."
        />

        {hasImages && <Checkbox checked={asFile} onCheckedChange={setAsFile} label="ارسال تصویر به صورت فایل" />}
      </div>
    </Modal>
  );
}

/** A picture's own thumbnail, or its kind's icon. The link to the bytes lives as long as the row. */
function Thumbnail({ file }: { readonly file: File }) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const image = isImageFile(file);

  useEffect(() => {
    const element = imageRef.current;
    if (!image || !element) return;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, image]);

  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- a local, unsent file
    return <img ref={imageRef} alt="" className="size-12 shrink-0 rounded-lg bg-surface object-cover" />;
  }
  const Icon = ATTACHMENT_ICONS[attachmentKindOf(file.type, file.name)];
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-brand">
      <Icon size={22} variant="twotone" />
    </span>
  );
}
