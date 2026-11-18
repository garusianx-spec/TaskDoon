import type { User } from '@taskin/contracts';
import { ROLES } from '@/data/reference';

/** Counts the active directory loaded for the current workspace, excluding former members. */
export function workspaceRoleCounts(users: readonly User[]) {
  return ROLES.map((role) => ({
    ...role,
    memberCount: users.filter((user) => !user.former && user.role === role.id).length,
  }));
}
