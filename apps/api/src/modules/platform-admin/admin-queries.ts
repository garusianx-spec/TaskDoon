import { ApiError } from '../../platform/http/api-error.js';

/** The system roles as the workspace screens name them; a custom role shows its key. */
const ROLE_NAMES: Readonly<Record<string, string>> = {
  owner: 'مالک سازمان',
  admin: 'مدیر سیستم',
  manager: 'مدیر پروژه',
  member: 'عضو تیم',
  guest: 'همکار مهمان',
};

export function roleName(key: string): string {
  return ROLE_NAMES[key] ?? key;
}

/** `%`, `_` and `\` typed into a search box match themselves. */
export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** Keyset cursors over `(created_at desc, id desc)`: opaque to clients. */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCursor(cursor: string | undefined): { readonly createdAt: string; readonly id: string } | null {
  if (!cursor) return null;
  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!createdAt || !id || !UUID.test(id) || Number.isNaN(Date.parse(createdAt))) {
    throw ApiError.validation([{ field: 'cursor', message: 'is not a cursor from this list' }]);
  }
  return { createdAt, id };
}

/** `maryam@example.com` → `ma***@example.com`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}
