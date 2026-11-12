import { contentTypeOf } from '@/api/uploads';
import { formatFileSize } from '@/lib/format';

export const WORKSPACE_ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MAX_ICON_BYTES = 1024 * 1024;

export function workspaceIconError(file: File): string | undefined {
  const type = contentTypeOf(file, file.name);
  if (!WORKSPACE_ICON_TYPES.some((allowed) => allowed === type))
    return 'فقط تصویر PNG، JPEG یا WebP پذیرفته می‌شود.';
  if (file.size === 0) return 'فایل تصویر خالی است.';
  if (file.size > MAX_ICON_BYTES) return `حجم تصویر نباید بیشتر از ${formatFileSize(MAX_ICON_BYTES)} باشد.`;
  return undefined;
}

export function readWorkspaceIcon(file: File): Promise<string> {
  // Normalize the type for files picked on systems that supply it only via the extension.
  const image = file.slice(0, file.size, contentTypeOf(file, file.name));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const failed = () => reject(new Error('خواندن تصویر ممکن نشد. دوباره تلاش کنید.'));
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : failed());
    reader.onerror = failed;
    reader.onabort = failed;
    reader.readAsDataURL(image);
  });
}
