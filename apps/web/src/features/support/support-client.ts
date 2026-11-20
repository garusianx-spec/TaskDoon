import type { SupportUploadView } from '@taskin/contracts';
import { SUPPORT_MAX_FILE_BYTES, SUPPORT_MAX_FILES } from '@taskin/contracts';
import { contentTypeOf, postForm } from '@/api/uploads';
import { http, isProblem, newIdempotencyKey } from '@/lib/api-client';
import { problemMessage } from '@/lib/api-problem';
export const DEPARTMENTS = { TECHNICAL: 'فنی', BILLING: 'مالی', GENERAL: 'عمومی' } as const;
export const PRIORITIES = { LOW: 'کم', MEDIUM: 'متوسط', HIGH: 'زیاد', URGENT: 'فوری' } as const;
export const STATUSES = {
  OPEN: 'باز',
  IN_PROGRESS: 'در حال بررسی',
  ANSWERED: 'پاسخ داده‌شده',
  RESOLVED: 'حل‌شده',
  CLOSED: 'بسته',
} as const;
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);
export function supportError(e: unknown): string {
  if (isProblem(e)) {
    if (e.body?.errors?.some((f) => f.message === 'SUPPORT_QUOTA'))
      return 'ظرفیت پیوست‌های پشتیبانی تکمیل است؛ می‌توانید درخواست را بدون فایل بفرستید.';
    if (e.code === 'PRECONDITION_FAILED')
      return 'تیکت به‌روز شده است؛ اطلاعات تازه را بررسی و دوباره تلاش کنید.';
    if (e.code === 'CONFLICT')
      return 'وضعیت درخواست تغییر کرده است؛ اطلاعات تازه را بررسی کنید. متن شما حفظ شده است.';
    if (e.code === 'UPLOAD_INVALID')
      return 'آپلود کامل نشد یا نوع فایل معتبر نیست. فایل و متن حفظ شده‌اند؛ دوباره تلاش کنید.';
  }
  return problemMessage(e, 'عملیات انجام نشد؛ اطلاعات حفظ شده است. دوباره تلاش کنید.');
}
export function supportFileError(files: readonly File[]): string | null {
  if (files.length > SUPPORT_MAX_FILES) return 'در هر پیام حداکثر ۵ فایل پیوست کنید.';
  if (files.some((f) => f.size === 0 || f.size > SUPPORT_MAX_FILE_BYTES))
    return 'حجم هر فایل باید بیشتر از صفر و حداکثر ۱۰ مگابایت باشد.';
  if (files.some((f) => !MIME.has(contentTypeOf(f, f.name))))
    return 'فایل‌های PDF، متن ساده و تصویر PNG، JPEG یا WebP مجازند.';
  return null;
}
export interface QueuedSupportFile {
  file: File;
  commandId: string;
  readyId?: string;
  scopeKey?: string;
}
export const queueSupportFiles = (files: readonly File[]): QueuedSupportFile[] =>
  files.map((file) => ({ file, commandId: newIdempotencyKey() }));
/** Keep these objects on retry: completed uploads and UUID commands are reused, never deleted. */
export async function uploadSupportFiles(
  files: QueuedSupportFile[],
  scope: { workspaceId: string } | { ticketId: string; admin: boolean },
): Promise<string[]> {
  const ids: string[] = [];
  const scopeKey = JSON.stringify(scope);
  for (const item of files) {
    if (item.scopeKey && item.scopeKey !== scopeKey) {
      item.commandId = newIdempotencyKey();
      item.readyId = undefined;
    }
    item.scopeKey = scopeKey;
    if (item.readyId) {
      ids.push(item.readyId);
      continue;
    }
    const base =
      'ticketId' in scope
        ? `/${scope.admin ? 'admin' : 'support'}/tickets/${scope.ticketId}/uploads`
        : '/support/uploads';
    const body = {
      fileName: item.file.name,
      size: item.file.size,
      contentType: contentTypeOf(item.file, item.file.name),
      commandId: item.commandId,
      ...('workspaceId' in scope ? { workspaceId: scope.workspaceId } : {}),
    };
    let plan: SupportUploadView;
    try {
      plan = await http.post<SupportUploadView>(base, body);
    } catch (e) {
      if (isProblem(e, 'UPLOAD_INVALID')) {
        item.commandId = newIdempotencyKey();
        plan = await http.post<SupportUploadView>(base, { ...body, commandId: item.commandId });
      } else throw e;
    }
    if (plan.status === 'rejected') {
      item.commandId = newIdempotencyKey();
      plan = await http.post<SupportUploadView>(base, { ...body, commandId: item.commandId });
    }
    if (plan.status !== 'ready') {
      if (!plan.plan) throw new Error('Upload plan unavailable');
      await postForm(plan.plan.url, plan.plan.fields, item.file, body.contentType);
      const ready = await http.post<SupportUploadView>(`${base}/${plan.id}/complete`);
      if (ready.status !== 'ready') throw new Error('Upload is not ready');
    }
    item.readyId = plan.id;
    ids.push(plan.id);
  }
  return ids;
}
