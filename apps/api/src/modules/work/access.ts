import { Injectable } from '@nestjs/common';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import type { PermissionActionId, ProjectRole } from '@taskin/contracts';
import type { Tx } from '../../platform/db/database.js';
import { projectMembers, projects } from '../../platform/db/schema/all.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { boardGrants, projectActions, type ProjectScope } from '../rbac/ability.js';

export type ProjectRow = typeof projects.$inferSelect;

export interface ProjectAccess {
  readonly project: ProjectRow;
  readonly role: ProjectRole | null;
  readonly actions: readonly PermissionActionId[];
}

/**
 * The project-visibility rule of `projectActions`, as a SQL condition on the projects row `alias`,
 * for list queries that must filter in the database (one statement, no N+1). Visible means: not
 * deleted, and the member is the owner, a member of the project, or — for a workspace-visible
 * project — a non-guest whose workspace role can view boards.
 */
export function projectVisibleSql(member: MembershipContext, alias = 'p'): SQL {
  const p = sql.raw(alias);
  if (member.isOwner) return sql`${p}.deleted_at is null`;
  const viaWorkspace = member.roleKey !== 'guest' && boardGrants(member).includes('view');
  const membership = sql`exists (select 1 from project_members pm where pm.project_id = ${p}.id and pm.user_id = ${member.userId})`;
  return viaWorkspace
    ? sql`(${p}.deleted_at is null and (${p}.visibility = 'workspace' or ${membership}))`
    : sql`(${p}.deleted_at is null and ${membership})`;
}

/** Throws 403 unless `actions` include `action`. */
export function assertAction(actions: readonly PermissionActionId[], action: PermissionActionId, detail?: string): void {
  if (!actions.includes(action)) throw ApiError.forbidden(detail);
}

interface PersonRow extends Record<string, unknown> {
  user_id: string;
  status: string;
  role_key: MembershipContext['roleKey'];
  is_owner: boolean;
  grants: string[];
  project_role: ProjectRole | null;
}

@Injectable()
export class AccessService {
  /**
   * Checks that every one of `userIds` is an active member who can see the project (assignees,
   * reviewers, subtask owners): work handed to someone who cannot open it is refused (422).
   */
  async assertCanView(tx: Tx, workspaceId: string, projectId: string, visibility: ProjectRow['visibility'], userIds: readonly string[]): Promise<void> {
    const unique = [...new Set(userIds)];
    const viewers = await this.viewersOf(tx, workspaceId, projectId, visibility, unique);
    const missing = unique.find((userId) => !viewers.includes(userId));
    if (missing) throw new ApiError('ASSIGNEE_NO_ACCESS', `User ${missing} cannot see this project.`);
  }

  /** Those of `userIds` who are active members able to see the project (notification fan-out). */
  async viewersOf(tx: Tx, workspaceId: string, projectId: string, visibility: ProjectRow['visibility'], userIds: readonly string[]): Promise<string[]> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return [];
    const result = await tx.execute<PersonRow>(sql`
      select m.user_id, m.status, r.key as role_key, w.owner_user_id = m.user_id as is_owner,
        coalesce(array_agg(rp.module::text || ':' || rp.action::text) filter (where rp.module is not null), '{}') as grants,
        (select pm.role from project_members pm where pm.project_id = ${projectId} and pm.user_id = m.user_id) as project_role
      from workspace_members m
      join workspaces w on w.id = m.workspace_id
      join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      left join role_permissions rp on rp.workspace_id = r.workspace_id and rp.role_id = r.id
      where m.workspace_id = ${workspaceId} and m.user_id = any(${sql.param(unique)}::uuid[])
      group by m.user_id, m.status, r.key, w.owner_user_id`);
    return result.rows
      .filter(
        (person) =>
          person.status === 'active' &&
          projectActions({ isOwner: person.is_owner, roleKey: person.role_key, grants: person.grants }, { visibility, role: person.project_role }).includes('view'),
      )
      .map((person) => person.user_id);
  }

  /** Every project the member can see, with what they may do in each (for CASL and `myActions`). */
  async scope(tx: Tx, member: MembershipContext): Promise<ProjectScope> {
    const rows = await tx
      .select({ id: projects.id, visibility: projects.visibility, role: projectMembers.role })
      .from(projects)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, member.userId)))
      .where(and(eq(projects.workspaceId, member.workspaceId), isNull(projects.deletedAt)));
    const scope = new Map<string, readonly PermissionActionId[]>();
    for (const row of rows) {
      const actions = projectActions(member, { visibility: row.visibility, role: row.role });
      if (actions.length > 0) scope.set(row.id, actions);
    }
    return scope;
  }

  /**
   * One project and what the member may do in it. An invisible or deleted project is a 404, so
   * private projects cannot be probed. `lock` takes the row lock the use case needs (task
   * numbering, membership changes) before anything else, in the canonical lock order.
   */
  async project(tx: Tx, member: MembershipContext, projectId: string, options: { lock?: 'update' | 'share' } = {}): Promise<ProjectAccess> {
    const query = tx
      .select({ project: projects, role: projectMembers.role })
      .from(projects)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, member.userId)))
      .where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.id, projectId), isNull(projects.deletedAt)));
    const [row] = options.lock ? await query.for(options.lock === 'update' ? 'update' : 'share', { of: projects }) : await query;
    if (!row) throw ApiError.notFound('The project');
    const actions = projectActions(member, { visibility: row.project.visibility, role: row.role });
    if (actions.length === 0) throw ApiError.notFound('The project');
    return { project: row.project, role: row.role, actions };
  }
}
