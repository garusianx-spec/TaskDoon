import type {
  ModulePermissions,
  PermissionActionId,
  PermissionMatrix,
  PermissionModuleId,
  RoleId,
  RolePermissions,
} from './domain.js';

/**
 * The permission vocabulary shared by the web app and the API: the five workspace roles, the
 * five modules and five actions of the RBAC matrix, and the matrix every new workspace starts
 * with. The web RBAC screen edits a copy of it; the API seeds `roles` and `role_permissions`
 * from it and tests its ability factory against it.
 */

export const ROLE_IDS = ['owner', 'admin', 'manager', 'member', 'guest'] as const satisfies readonly RoleId[];

export const PERMISSION_MODULE_IDS = [
  'messages',
  'boards',
  'files',
  'reports',
  'members',
] as const satisfies readonly PermissionModuleId[];

export const PERMISSION_ACTION_IDS = [
  'view',
  'create',
  'edit',
  'delete',
  'assign',
] as const satisfies readonly PermissionActionId[];

export interface SystemRole {
  readonly id: RoleId;
  /** Lower number means more authority. A member may only manage roles ranked below their own. */
  readonly rank: number;
  /** The owner row of the matrix can never be edited. */
  readonly locked: boolean;
}

export const SYSTEM_ROLES: readonly SystemRole[] = [
  { id: 'owner', rank: 0, locked: true },
  { id: 'admin', rank: 1, locked: false },
  { id: 'manager', rank: 2, locked: false },
  { id: 'member', rank: 3, locked: false },
  { id: 'guest', rank: 4, locked: false },
];

const grant = (...actions: readonly PermissionActionId[]): ModulePermissions => ({
  view: actions.includes('view'),
  create: actions.includes('create'),
  edit: actions.includes('edit'),
  delete: actions.includes('delete'),
  assign: actions.includes('assign'),
});

const ALL = grant(...PERMISSION_ACTION_IDS);
const NONE = grant();

/** Shipping defaults. The RBAC screen edits a working copy of this and can reset back to it. */
export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  owner: { messages: ALL, boards: ALL, files: ALL, reports: ALL, members: ALL },
  admin: {
    messages: ALL,
    boards: ALL,
    files: ALL,
    reports: ALL,
    members: grant('view', 'create', 'edit', 'assign'),
  },
  manager: {
    messages: grant('view', 'create', 'edit', 'assign'),
    boards: ALL,
    files: grant('view', 'create', 'edit', 'delete'),
    reports: grant('view', 'create', 'edit'),
    members: grant('view', 'assign'),
  },
  member: {
    messages: grant('view', 'create', 'edit'),
    boards: grant('view', 'create', 'edit', 'assign'),
    files: grant('view', 'create'),
    reports: grant('view', 'create'),
    members: grant('view'),
  },
  guest: {
    messages: grant('view'),
    boards: grant('view'),
    files: grant('view'),
    reports: NONE,
    members: NONE,
  },
};

/** One granted cell of the matrix, e.g. `members:invite` is `{ module: 'members', action: 'create' }`. */
export interface PermissionCell {
  readonly module: PermissionModuleId;
  readonly action: PermissionActionId;
}

/** The granted cells of one role's row, in matrix order. */
export function grantedCells(row: RolePermissions): readonly PermissionCell[] {
  return PERMISSION_MODULE_IDS.flatMap((module) =>
    PERMISSION_ACTION_IDS.filter((action) => row[module][action]).map((action) => ({ module, action })),
  );
}

/** Builds a matrix row from granted cells; every cell not listed is denied. */
export function rowFromCells(cells: readonly PermissionCell[]): RolePermissions {
  const has = (module: PermissionModuleId, action: PermissionActionId) =>
    cells.some((cell) => cell.module === module && cell.action === action);
  const row = (module: PermissionModuleId): ModulePermissions => ({
    view: has(module, 'view'),
    create: has(module, 'create'),
    edit: has(module, 'edit'),
    delete: has(module, 'delete'),
    assign: has(module, 'assign'),
  });
  return {
    messages: row('messages'),
    boards: row('boards'),
    files: row('files'),
    reports: row('reports'),
    members: row('members'),
  };
}
