import type { Project, User } from '@taskin/contracts';

let users: readonly User[] = [];
let projects: readonly Project[] = [];
let former: readonly User[] = [];

/**
 * The active workspace's people and projects, for the lookups every screen makes (`userById`,
 * `projectById`, pickers). The provider copies them from its state on each render, before any
 * component below it reads them, so they always match what the reducer holds — the demo fixtures
 * or what the API returned.
 */
export function setDirectory(nextUsers: readonly User[], nextProjects: readonly Project[], nextFormer: readonly User[] = []): void {
  users = nextUsers;
  projects = nextProjects;
  former = nextFormer;
}

export const directory = {
  users: (): readonly User[] => users,
  projects: (): readonly Project[] => projects,
  /** People removed from the workspace: only for naming what they left behind, never for pickers. */
  former: (): readonly User[] => former,
};
