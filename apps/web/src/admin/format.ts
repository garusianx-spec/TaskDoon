import type { ConversationKind, PlatformSessionStatus, PlatformUserStatus, ProjectRole } from '@taskin/contracts';
import { formatJalali, formatTime } from '@taskin/jalali';
import { formatMobile } from '@taskin/text';
import type { BadgeTone } from '@/components/ui';

/** `+989121234567` → `۰۹۱۲ ۱۲۳ ۴۵۶۷`. */
export function phoneLabel(e164: string): string {
  return formatMobile(e164.startsWith('+98') ? `0${e164.slice(3)}` : e164);
}

/** `۱ مهر ۱۴۰۵، ۰۹:۳۰`. */
export function dateTimeLabel(iso: string): string {
  return `${formatJalali(iso, 'medium')}، ${formatTime(iso)}`;
}

export const USER_STATUS: Readonly<Record<PlatformUserStatus, { readonly label: string; readonly tone: BadgeTone }>> = {
  active: { label: 'فعال', tone: 'success' },
  suspended: { label: 'معلق', tone: 'warning' },
  deleted: { label: 'حذف‌شده', tone: 'error' },
};

export const MEMBER_STATUS: Readonly<Record<'active' | 'suspended' | 'left', { readonly label: string; readonly tone: BadgeTone }>> = {
  active: { label: 'عضو فعال', tone: 'success' },
  suspended: { label: 'معلق', tone: 'warning' },
  left: { label: 'خارج‌شده', tone: 'neutral' },
};

export const SESSION_STATUS: Readonly<Record<PlatformSessionStatus, { readonly label: string; readonly tone: BadgeTone }>> = {
  active: { label: 'فعال', tone: 'success' },
  revoked: { label: 'پایان‌یافته', tone: 'error' },
  expired: { label: 'منقضی', tone: 'neutral' },
};

export const REVOKE_REASONS: Readonly<Record<string, string>> = {
  logout: 'خروج کاربر',
  user_revoked: 'بسته‌شده توسط کاربر',
  reuse_detected: 'استفاده دوباره از توکن',
  password_changed: 'تغییر رمز عبور',
  admin_action: 'مدیر پلتفرم',
  expired: 'انقضا',
};

export const DEVICE_TYPES: Readonly<Record<string, string>> = { mobile: 'موبایل', tablet: 'تبلت', desktop: 'رایانه' };

export const CONVERSATION_KINDS: Readonly<Record<ConversationKind, string>> = { direct: 'گفتگوی مستقیم', group: 'گروه', channel: 'کانال' };

export const CONVERSATION_ROLES: Readonly<Record<string, string>> = { owner: 'سازنده', admin: 'مدیر', member: 'عضو' };

export const PROJECT_ROLES: Readonly<Record<ProjectRole, string>> = { lead: 'سرپرست', contributor: 'مشارکت‌کننده', viewer: 'بیننده' };

/** The platform audit log's verbs. */
export const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  'admin.users.search': 'جستجوی کاربران',
  'admin.user.view': 'مشاهده پروفایل',
  'admin.sessions.view': 'مشاهده نشست‌ها',
  'admin.session.revoke': 'پایان یک نشست',
  'admin.sessions.revoke_all': 'پایان همه نشست‌ها',
  'admin.password_reset.issue': 'صدور کد بازنشانی رمز',
  'admin.conversations.list': 'فهرست گفتگوها',
  'admin.conversation.view': 'مشاهده گفتگو',
  'admin.messages.read': 'خواندن پیام‌ها',
  'admin.attachment.open': 'باز کردن فایل',
  'admin.workspaces.search': 'جستجوی ورک‌اسپیس‌ها',
  'admin.workspace.view': 'مشاهده ورک‌اسپیس',
};
