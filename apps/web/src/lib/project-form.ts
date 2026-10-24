import type { AvatarTone, Department, User } from '@taskin/contracts';

/** Solid picker previews stay visible independently of the workspace's accent and theme. */
export const PROJECT_COLOR_SWATCHES: Readonly<Record<AvatarTone, string>> = {
  brand: '#4f46e5', teal: '#06b6d4', violet: '#7c3aed',
  amber: '#f59e0b', rose: '#ec4899', slate: '#64748b',
};

export type ProjectDepartmentGlyph = 'engineering' | 'product' | 'design' | 'marketing' | 'finance' | 'operations' | 'custom';

/** Match Persian and Arabic keyboard variants, case, and equivalent spacing. */
export function normalizeDepartmentName(value: string): string {
  return value.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\s\u200c\u200d]+/g, ' ').trim().toLocaleLowerCase('fa');
}

/** A confirmed custom department may arrive in props before the creation modal closes. */
export function projectDepartmentOptions(saved: readonly Department[], pending: readonly Department[]): readonly Department[] {
  // Keep the form-local identity until it closes: changing IDs after a lost create response
  // would also change its submission signature and discard the retry's idempotency key.
  const visibleSaved = saved.filter(department => !pending.some(entry => entry.id !== department.id
    && normalizeDepartmentName(entry.name) === normalizeDepartmentName(department.name)));
  return [...new Map([...pending, ...visibleSaved].map(department => [department.id, department])).values()];
}

export function departmentGlyph(id: string, name: string): ProjectDepartmentGlyph {
  const text = normalizeDepartmentName(`${id} ${name}`);
  if (/engineering|development|software|مهندس|توسعه|فنی/.test(text)) return 'engineering';
  if (/design|طراحی|گرافیک/.test(text)) return 'design';
  if (/marketing|بازاریاب|تبلیغ/.test(text)) return 'marketing';
  if (/finance|accounting|admin|مالی|اداری|حسابدار/.test(text)) return 'finance';
  if (/operations|support|عملیات|پشتیبان/.test(text)) return 'operations';
  if (/product|محصول/.test(text)) return 'product';
  return 'custom';
}

/** A set toggle preserves stable selection order and never grows beyond the API limit. */
export function toggleProjectSelection(ids: readonly string[], id: string, limit: number): readonly string[] {
  const distinct = [...new Set(ids)];
  return distinct.includes(id) ? distinct.filter(entry => entry !== id)
    : distinct.length < limit ? [...distinct, id] : distinct;
}

export function projectMemberIds(ids: readonly string[], currentUserId: string): readonly string[] {
  return [...new Set([currentUserId, ...ids].filter(Boolean))];
}

export function matchingProjectMembers(members: readonly User[], search: string): readonly User[] {
  const query = normalizeDepartmentName(search);
  return members.filter(member => !member.former
    && normalizeDepartmentName(`${member.fullName} ${member.email} ${member.jobTitle}`).includes(query));
}
