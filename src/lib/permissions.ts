import type { PermissionActionId, PermissionMatrix, PermissionModuleId, RoleId, User } from '@/types';

/**
 * Permission helpers.
 *
 * Reads are resolved against the live matrix the RBAC screen edits, so revoking a permission
 * there takes effect immediately across the app rather than being duplicated in component
 * logic.
 */
export function can(
  permissions: PermissionMatrix,
  role: RoleId,
  moduleId: PermissionModuleId,
  action: PermissionActionId,
): boolean {
  return permissions[role][moduleId][action];
}

/**
 * Who may pin or unpin a message in a conversation.
 *
 * Pinning changes what every member sees at the top of the thread, so it is gated on the
 * `edit` right over the messages module — which by default only مالک سازمان، مدیر سیستم and
 * مدیر پروژه hold. Members and guests can still read the banner and jump to the message.
 */
export function canManagePins(user: User, permissions: PermissionMatrix): boolean {
  return can(permissions, user.role, 'messages', 'edit');
}

/** Forwarding copies content into another conversation, so it needs the `create` right. */
export function canForwardMessages(user: User, permissions: PermissionMatrix): boolean {
  return can(permissions, user.role, 'messages', 'create');
}
