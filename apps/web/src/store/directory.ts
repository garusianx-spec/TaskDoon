import type { Department, Project, User } from '@taskin/contracts';
import { DEPARTMENTS } from '@/data/reference';

let users: readonly User[] = [];
let projects: readonly Project[] = [];
let former: readonly User[] = [];
let departments: readonly Department[] = DEPARTMENTS;

/**
 * The active workspace's people and projects, for the lookups every screen makes (`userById`,
 * `projectById`, pickers). The provider copies them from its state on each render, before any
 * component below it reads them, so they always match what the reducer holds — the demo fixtures
 * or what the API returned.
 */
export function setDirectory(nextUsers: readonly User[], nextProjects: readonly Project[], nextFormer: readonly User[] = [], nextDepartments: readonly Department[] = DEPARTMENTS): void {
  users = nextUsers;
  projects = nextProjects;
  former = nextFormer;
  departments = nextDepartments;
}

export const directory = {
  users: (): readonly User[] => users,
  projects: (): readonly Project[] => projects,
  departments: (): readonly Department[] => departments,
  /** People removed from the workspace: only for naming what they left behind, never for pickers. */
  former: (): readonly User[] => former,
};
