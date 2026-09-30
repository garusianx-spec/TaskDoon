import type { Attachment } from '@taskin/contracts';
import { formatFileSize } from './format';
import { formatJalali } from '@taskin/jalali';
import { resolveFileUrl } from '@/store/files';

/**
 * Saves an attachment to the user's device.
 *
 * Uploaded files download through a short-lived link (or their own `url`, for a local preview).
 * Demo fixtures ship no binaries (see README), so for those the browser receives a small,
 * clearly named text receipt describing the file rather than a fake `.zip` or `.pdf`.
 */
export async function downloadAttachment(attachment: Attachment): Promise<void> {
  // Uploaded files get a short-lived link that already says "download, with this name".
  const url = await resolveFileUrl(attachment, 'attachment');
  const anchor = document.createElement('a');
  let revoke: (() => void) | null = null;

  if (url) {
    anchor.href = url;
    anchor.download = attachment.name;
  } else {
    const receipt = [
      `نام فایل: ${attachment.name}`,
      `حجم: ${formatFileSize(attachment.size)}`,
      `بارگذاری: ${formatJalali(attachment.uploadedAt, 'full')}`,
      '',
      'این نسخه نمایشی تسک‌دون است و محتوای واقعی فایل روی سرور ذخیره نشده است.',
    ].join('\n');
    const blobUrl = URL.createObjectURL(new Blob([receipt], { type: 'text/plain;charset=utf-8' }));
    anchor.href = blobUrl;
    anchor.download = `${attachment.name}.txt`;
    revoke = () => URL.revokeObjectURL(blobUrl);
  }

  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (revoke) window.setTimeout(revoke, 0);
}
