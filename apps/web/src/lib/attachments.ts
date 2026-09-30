import type { AttachmentKind } from '@taskin/contracts';

/** The kind a picked file shows as (the server decides the stored kind from the bytes). */
export function attachmentKindOf(mime: string, name: string): AttachmentKind {
  const type = mime.toLowerCase();
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv' || ['xlsx', 'xls', 'csv'].includes(extension)) return 'sheet';
  if (/(zip|rar|7z|gzip|tar)/.test(type) || ['zip', 'rar', '7z', 'gz', 'tar'].includes(extension)) return 'archive';
  return 'document';
}
