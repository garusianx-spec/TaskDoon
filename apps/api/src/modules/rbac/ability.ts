import { AbilityBuilder, createMongoAbility, type ForcedSubject, type MongoAbility } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import {
  PERMISSION_ACTION_IDS,
  PERMISSION_MODULE_IDS,
  type PermissionActionId,
  type PermissionModuleId,
  type ProjectRole,
  type ProjectVisibility,
  type RolePermissions,
  rowFromCells,
} from '@taskin/contracts';
import type { MembershipContext } from '../../platform/http/request.js';

/**
 * Workspace-scope authorisation (RFC §5.3). Each module of the permission matrix governs a set
 * of CASL subjects; a granted cell `module:action` becomes `can(action, subject)` for each of
 * them. The channel overlay arrives with chat (M3).
 */
export const MODULE_SUBJECTS = {
  messages: ['Conversation', 'Message', 'Reaction'],
  boards: ['Project', 'BoardColumn', 'Task', 'Subtask', 'TaskComment', 'CalendarEvent', 'Label'],
  files: ['File'],
  reports: ['Report'],
  members: ['Member', 'Invitation', 'Role', 'WorkspaceSettings', 'Department'],
} as const satisfies Record<PermissionModuleId, readonly string[]>;

/**
 * The boards subjects that belong to one project. With a project scope their rules carry a
 * `projectId` condition; the workflow's columns and the labels are workspace-wide.
 */
export const PROJECT_SUBJECTS = ['Project', 'Task', 'Subtask', 'TaskComment', 'CalendarEvent'] as const;
export type ProjectSubjectName = (typeof PROJECT_SUBJECTS)[number];

export type SubjectName = (typeof MODULE_SUBJECTS)[PermissionModuleId][number] | 'Workspace' | 'all';
export type Action = PermissionActionId | 'manage';

/** Condition fields the rules use; CASL matches them against plain objects tagged with `subject()`. */
export interface MemberSubject {
  readonly userId: string;
}

export interface ProjectScopedSubject {
  readonly projectId: string;
}

/** One tagged variant per project subject, so CASL can tell `Task` rules from `Project` rules. */
type ProjectScopedSubjects = { [K in ProjectSubjectName]: ProjectScopedSubject & ForcedSubject<K> }[ProjectSubjectName];

export type AppSubject = SubjectName | (MemberSubject & ForcedSubject<'Member'>) | ProjectScopedSubjects;
export type AppAbility = MongoAbility<[Action, AppSubject]>;

export const cell = (module: PermissionModuleId, action: PermissionActionId) => `${module}:${action}`;

/** Every cell, as the owner holds them. */
export const ALL_CELLS: readonly string[] = PERMISSION_MODULE_IDS.flatMap((module) =>
  PERMISSION_ACTION_IDS.map((action) => cell(module, action)),
);

/** A member's grants as a matrix row, for `GET /me/permissions` and the RBAC screen. */
export function grantsToRow(grants: readonly string[]): RolePermissions {
  return rowFromCells(
    grants.map((entry) => {
      const [module, action] = entry.split(':') as [PermissionModuleId, PermissionActionId];
      return { module, action };
    }),
  );
}

/* ------------------------------------------------------------------ project overlay */

/** What each project role allows inside its project (RFC §5.3 rule 3). */
export const PROJECT_ROLE_ACTIONS: Readonly<Record<ProjectRole, readonly PermissionActionId[]>> = {
  lead: PERMISSION_ACTION_IDS,
  contributor: ['view', 'create', 'edit', 'assign'],
  viewer: ['view'],
};

/** Guests never hold more than `contributor` in a project, whatever they were given. */
export function effectiveProjectRole(member: Pick<MembershipContext, 'roleKey'>, role: ProjectRole): ProjectRole {
  return member.roleKey === 'guest' && role === 'lead' ? 'contributor' : role;
}

/** The boards actions a member's workspace role grants. */
export function boardGrants(member: Pick<MembershipContext, 'grants'>): PermissionActionId[] {
  return PERMISSION_ACTION_IDS.filter((action) => member.grants.includes(cell('boards', action)));
}

/**
 * What `member` may do with the work of one project, in matrix actions. Empty means the project
 * is invisible to them. The owner may do everything; a project role replaces the workspace role
 * inside its project (widening or narrowing it); without one, a workspace-visible project follows
 * the workspace's boards grants, and a private project is invisible. Guests only ever see the
 * projects they are members of.
 *
 * `projectVisibilitySql` in work/access.ts is the same rule in SQL, for list queries; the
 * conformance test holds the two to each other.
 */
export function projectActions(
  member: Pick<MembershipContext, 'isOwner' | 'roleKey' | 'grants'>,
  project: { readonly visibility: ProjectVisibility; readonly role: ProjectRole | null },
): readonly PermissionActionId[] {
  if (member.isOwner) return PERMISSION_ACTION_IDS;
  if (project.role) return PROJECT_ROLE_ACTIONS[effectiveProjectRole(member, project.role)];
  if (project.visibility === 'workspace' && member.roleKey !== 'guest') {
    const grants = boardGrants(member);
    return grants.includes('view') ? grants : [];
  }
  return [];
}

/** Per-project actions for every project the member can see, keyed by project id. */
export type ProjectScope = ReadonlyMap<string, readonly PermissionActionId[]>;

@Injectable()
export class AbilityFactory {
  /**
   * The member's ability. Without a project scope, boards grants apply to every project (the
   * coarse, route-level view of the matrix). With one, the project subjects are allowed only in
   * the projects of the scope, with that project's actions.
   */
  forMember(member: MembershipContext, scope?: ProjectScope): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
    // Membership alone lets you see the workspace you belong to.
    can('view', 'Workspace');
    if (member.isOwner) {
      can('manage', 'all');
      // Ownership must be transferred before the owner can leave or be removed.
      cannot('delete', 'Member', { userId: member.userId });
      return build();
    }
    for (const entry of member.grants) {
      const [module, action] = entry.split(':') as [PermissionModuleId, PermissionActionId];
      const subjects = MODULE_SUBJECTS[module];
      if (!subjects) continue;
      for (const subject of subjects) {
        if (scope && (PROJECT_SUBJECTS as readonly string[]).includes(subject)) continue;
        can(action, subject);
      }
    }
    if (scope) {
      for (const [projectId, actions] of scope) {
        for (const subject of PROJECT_SUBJECTS) can([...actions], subject, { projectId });
      }
    }
    return build();
  }
}
