import type { AdministrativeStatus, PlatformAdminRole } from '@taskin/contracts';

export const PRIMARY_OWNER_PHONE = '+989901819085';
export const isPrimaryOwner = (phone: string): boolean => phone === PRIMARY_OWNER_PHONE;

/** Any platform administrator or the primary owner is protected from peer moderation and reset actions. */
export function isProtectedAdminTarget(user: { phone: string; isPlatformAdmin: boolean }): boolean {
  return isPrimaryOwner(user.phone) || user.isPlatformAdmin;
}

/** Legacy flag grants remain ADMIN; a phone number alone never grants any privilege. */
export function platformRole(user: {
  isPlatformAdmin: boolean;
  phone: string;
  platformAdminRole?: PlatformAdminRole | null;
}): PlatformAdminRole | null {
  if (!user.isPlatformAdmin) return null;
  if (isPrimaryOwner(user.phone)) return 'SUPER_ADMIN';
  return user.platformAdminRole ?? 'ADMIN';
}
export function administrativeStatus(user: {
  platformAdminStatus: AdministrativeStatus;
  status: string;
}): AdministrativeStatus {
  return user.status === 'active' ? user.platformAdminStatus : 'SUSPENDED';
}
