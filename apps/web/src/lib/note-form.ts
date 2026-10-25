import type { NoteCategory } from '@taskin/contracts';
import { isProblem } from '@/api/http';
import { problemMessage } from '@/api/messages';

export function noteSaveError(error: unknown): string {
  return isProblem(error, 'PRECONDITION_FAILED')
    ? 'این یادداشت در پنجره دیگری تغییر کرده است. متن فعلی حفظ شد؛ آن را کپی کنید و صفحه را تازه کنید.'
    : problemMessage(error, 'ذخیره یادداشت ممکن نشد. متن شما حفظ شده است؛ دوباره تلاش کنید.');
}

/** New drafts inherit the current notebook; "all" resolves Personal by its stable key. */
export function newNoteCategory(categories: readonly NoteCategory[], filter: string): string | null {
  if (filter !== 'all') return categories.find(category => category.id === filter)?.id ?? null;
  return categories.find(category => category.key === 'personal' || category.id === 'personal')?.id ?? null;
}

/** Follow an optimistic notebook's canonical ID; deleted notebooks return to the all filter. */
export function reconcileNoteCategory(before: readonly NoteCategory[], after: readonly NoteCategory[], selected: string): string {
  if (selected === 'all' || after.some(category => category.id === selected)) return selected;
  const previous = before.find(category => category.id === selected);
  return previous?.id.includes('-local-') ? after.find(category => category.label === previous.label)?.id ?? 'all' : 'all';
}
