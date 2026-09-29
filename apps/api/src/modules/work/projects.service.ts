import { Injectable } from '@nestjs/common';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type {
  CreateProjectBody,
  PermissionActionId,
  ProjectMemberView,
  ProjectRole,
  ProjectView,
  ProjectVisibility,
  UpdateProjectBody,
} from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { isUniqueViolation, PG, pgError } from '../../platform/db/pg-errors.js';
import { iso, num } from '../../platform/db/rows.js';
import { plans, projectMembers, projects, projectStars, workspaces } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { AbilityFactory, effectiveProjectRole, PROJECT_ROLE_ACTIONS, projectActions } from '../rbac/ability.js';
import { MembershipService } from '../rbac/membership.service.js';
import { AccessService, assertAction, type ProjectRow, projectVisibleSql } from './access.js';
import { createProjectWorkflow } from './board.service.js';

interface ProjectListRow extends Record<string, unknown> {
  id: string;
  key: string;
  name: string;
  description: string;
  department_id: string | null;
  color: ProjectView['color'];
  parent_id: string | null;
  visibility: ProjectVisibility;
  archived: boolean;
  starred: boolean;
  my_role: ProjectRole | null;
  member_ids: string[];
  task_count: string | number;
  open_task_count: string | number;
  created_at: string;
}

/** `granted` may be handed out only by someone who holds every action it carries. */
function assertCanGrant(actorActions: readonly PermissionActionId[], role: ProjectRole): void {
  if (!PROJECT_ROLE_ACTIONS[role].every((action) => actorActions.includes(action))) throw new ApiError('PRIVILEGE_ESCALATION');
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly access: AccessService,
    private readonly abilities: AbilityFactory,
    private readonly memberships: MembershipService,
  ) {}

  /** Every project the caller can see, with their stars, role and actions (one statement). */
  async list(member: MembershipContext): Promise<ProjectView[]> {
    const result = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx.execute<ProjectListRow>(this.listSql(member)),
    );
    return result.rows.map((row) => this.view(member, row));
  }

  async get(member: MembershipContext, projectId: string): Promise<ProjectView> {
    const result = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx.execute<ProjectListRow>(this.listSql(member, projectId)),
    );
    const row = result.rows[0];
    if (!row) throw ApiError.notFound('The project');
    return this.view(member, row);
  }

  async create(member: MembershipContext, body: CreateProjectBody): Promise<ProjectView> {
    if (!this.abilities.forMember(member).can('create', 'Project')) throw ApiError.forbidden();
    const id = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async (unit) => {
      const tx = unit.tx;
      // The workspace row serialises project creation, so two creates cannot both slip under the plan limit.
      const [workspace] = await tx
        .select({ maxProjects: sql<number | null>`(${plans.limits} ->> 'maxProjects')::int` })
        .from(workspaces)
        .innerJoin(plans, eq(plans.id, workspaces.planId))
        .where(eq(workspaces.id, member.workspaceId))
        .for('update', { of: workspaces });
      if (!workspace) throw ApiError.notFound('The workspace');
      if (workspace.maxProjects !== null) {
        const [live] = await tx.select({ n: count() }).from(projects).where(and(eq(projects.workspaceId, member.workspaceId), isNull(projects.deletedAt)));
        if ((live?.n ?? 0) >= workspace.maxProjects) throw new ApiError('PLAN_LIMIT_REACHED', `This plan allows ${workspace.maxProjects} projects.`);
      }
      if (body.parentId) await this.assertParent(tx, member, body.parentId, null);
      // Every project owns its board: its own workflow, starting with the four built-in columns.
      const workflow = { id: await createProjectWorkflow(tx, member.workspaceId, body.key) };
      try {
        const [created] = await tx
          .insert(projects)
          .values({
            workspaceId: member.workspaceId,
            key: body.key,
            name: body.name.trim(),
            description: body.description?.trim() ?? '',
            departmentId: body.departmentId ?? null,
            color: body.color ?? 'brand',
            parentId: body.parentId ?? null,
            visibility: body.visibility ?? 'workspace',
            workflowId: workflow.id,
            createdBy: member.userId,
          })
          .returning({ id: projects.id, key: projects.key, name: projects.name, visibility: projects.visibility });
        if (!created) throw new Error('project insert returned nothing');
        // The creator leads the project (a guest creator is capped at contributor by the ability).
        await tx.insert(projectMembers).values({ workspaceId: member.workspaceId, projectId: created.id, userId: member.userId, role: 'lead', addedBy: member.userId });
        await this.memberships.bump(unit, member.workspaceId);
        await this.audit.write(tx, {
          action: 'project.create',
          workspaceId: member.workspaceId,
          resourceType: 'project',
          resourceId: created.id,
          changes: { after: { key: created.key, name: created.name, visibility: created.visibility } },
        });
        await this.outbox.add(tx, { type: 'project.created', aggregateType: 'project', aggregateId: created.id, workspaceId: member.workspaceId, payload: { projectId: created.id } });
        return created.id;
      } catch (error) {
        if (isUniqueViolation(error, 'projects_ws_key_uq')) throw new ApiError('PROJECT_KEY_TAKEN');
        const code = pgError(error)?.code;
        if (code === PG.foreignKeyViolation) throw ApiError.validation([{ field: 'departmentId', message: 'unknown department' }]);
        throw error;
      }
    });
    return this.get(member, id);
  }

  async update(member: MembershipContext, projectId: string, body: UpdateProjectBody): Promise<ProjectView> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async (unit) => {
      const tx = unit.tx;
      const { project, actions } = await this.access.project(tx, member, projectId, { lock: 'update' });
      assertAction(actions, 'edit');
      if (body.visibility !== undefined && body.visibility !== project.visibility) assertAction(actions, 'delete', 'Changing who can see a project needs the delete permission.');
      if (body.parentId) await this.assertParent(tx, member, body.parentId, project.id);
      const fields = Object.entries(body)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
      try {
        await tx
          .update(projects)
          .set({
            ...(body.name !== undefined ? { name: body.name.trim() } : {}),
            ...(body.description !== undefined ? { description: body.description.trim() } : {}),
            ...(body.departmentId !== undefined ? { departmentId: body.departmentId } : {}),
            ...(body.color !== undefined ? { color: body.color } : {}),
            ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
            ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
            ...(body.archived !== undefined ? { archivedAt: body.archived ? (project.archivedAt ?? sql`now()`) : null } : {}),
          })
          .where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.id, projectId)));
      } catch (error) {
        if (pgError(error)?.code === PG.foreignKeyViolation) throw ApiError.validation([{ field: 'departmentId', message: 'unknown department' }]);
        throw error;
      }
      if (body.visibility !== undefined && body.visibility !== project.visibility) await this.memberships.bump(unit, member.workspaceId);
      await this.audit.write(tx, {
        action: 'project.update',
        workspaceId: member.workspaceId,
        resourceType: 'project',
        resourceId: projectId,
        changes: { before: { name: project.name, visibility: project.visibility, archived: project.archivedAt !== null }, after: body },
      });
      await this.outbox.add(tx, { type: 'project.updated', aggregateType: 'project', aggregateId: projectId, workspaceId: member.workspaceId, payload: { projectId, fields } });
    });
    return this.get(member, projectId);
  }

  /** Soft delete; its tasks disappear with it. A project with live sub-projects cannot go. */
  async remove(member: MembershipContext, projectId: string): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async (unit) => {
      const tx = unit.tx;
      const { project, actions } = await this.access.project(tx, member, projectId, { lock: 'update' });
      assertAction(actions, 'delete');
      const [children] = await tx
        .select({ n: count() })
        .from(projects)
        .where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.parentId, projectId), isNull(projects.deletedAt)));
      if ((children?.n ?? 0) > 0) throw new ApiError('CONFLICT', 'Delete or move its sub-projects first.');
      await tx.update(projects).set({ deletedAt: sql`now()` }).where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.id, projectId)));
      await this.memberships.bump(unit, member.workspaceId);
      await this.audit.write(tx, { action: 'project.delete', workspaceId: member.workspaceId, resourceType: 'project', resourceId: projectId, changes: { before: { key: project.key, name: project.name } } });
      await this.outbox.add(tx, { type: 'project.deleted', aggregateType: 'project', aggregateId: projectId, workspaceId: member.workspaceId, payload: { projectId } });
    });
  }

  /* ------------------------------------------------------------------ members */

  async members(member: MembershipContext, projectId: string): Promise<ProjectMemberView[]> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      await this.access.project(tx, member, projectId);
      const rows = await tx
        .select({ userId: projectMembers.userId, role: projectMembers.role, addedAt: projectMembers.addedAt })
        .from(projectMembers)
        .where(and(eq(projectMembers.workspaceId, member.workspaceId), eq(projectMembers.projectId, projectId)))
        .orderBy(projectMembers.addedAt);
      return rows.map((row) => ({ userId: row.userId, role: row.role, addedAt: row.addedAt.toISOString() }));
    });
  }

  /**
   * Adds a member or changes their role. Needs `assign` in the project, and nobody hands out (or
   * takes away) more than they hold themselves. Guests top out at contributor.
   */
  async putMember(member: MembershipContext, projectId: string, userId: string, role: ProjectRole): Promise<ProjectMemberView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async (unit) => {
      const tx = unit.tx;
      const { actions } = await this.access.project(tx, member, projectId, { lock: 'update' });
      assertAction(actions, 'assign');
      assertCanGrant(actions, role);
      const target = await this.targetMember(tx, member.workspaceId, projectId, userId);
      if (target.roleKey === 'guest' && effectiveProjectRole({ roleKey: 'guest' }, role) !== role) {
        throw ApiError.validation([{ field: 'role', message: 'guests can be at most contributors' }]);
      }
      if (target.projectRole) assertCanGrant(actions, target.projectRole);
      const [row] = await tx
        .insert(projectMembers)
        .values({ workspaceId: member.workspaceId, projectId, userId, role, addedBy: member.userId })
        .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role } })
        .returning();
      if (!row) throw new Error('project member upsert returned nothing');
      await this.membershipChanged(unit, member, projectId, userId, role, target.projectRole);
      return { userId: row.userId, role: row.role, addedAt: row.addedAt.toISOString() };
    });
  }

  async removeMember(member: MembershipContext, projectId: string, userId: string): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async (unit) => {
      const tx = unit.tx;
      const { actions } = await this.access.project(tx, member, projectId, { lock: 'update' });
      // Leaving a project is always allowed; removing someone else needs `assign` and their rank.
      if (userId !== member.userId) assertAction(actions, 'assign');
      const [existing] = await tx
        .delete(projectMembers)
        .where(and(eq(projectMembers.workspaceId, member.workspaceId), eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .returning({ role: projectMembers.role });
      if (!existing) throw ApiError.notFound('The project member');
      if (userId !== member.userId) assertCanGrant(actions, existing.role);
      await this.membershipChanged(unit, member, projectId, userId, null, existing.role);
    });
  }

  /* ------------------------------------------------------------------ stars */

  async star(member: MembershipContext, projectId: string, starred: boolean): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      await this.access.project(tx, member, projectId);
      if (starred) {
        await tx.insert(projectStars).values({ workspaceId: member.workspaceId, projectId, userId: member.userId }).onConflictDoNothing();
      } else {
        await tx.delete(projectStars).where(and(eq(projectStars.userId, member.userId), eq(projectStars.projectId, projectId)));
      }
      await this.audit.write(tx, { action: starred ? 'project.star' : 'project.unstar', workspaceId: member.workspaceId, resourceType: 'project', resourceId: projectId });
    });
  }

  /* ------------------------------------------------------------------ helpers */

  private listSql(member: MembershipContext, projectId?: string) {
    return sql`
      select p.id, p.key, p.name, p.description, p.department_id, p.color, p.parent_id, p.visibility,
        p.archived_at is not null as archived,
        exists (select 1 from project_stars s where s.user_id = ${member.userId} and s.project_id = p.id) as starred,
        (select pm.role from project_members pm where pm.project_id = p.id and pm.user_id = ${member.userId}) as my_role,
        coalesce((select array_agg(pm.user_id order by pm.added_at, pm.user_id) from project_members pm where pm.project_id = p.id), '{}') as member_ids,
        (select count(*) from tasks t where t.workspace_id = p.workspace_id and t.project_id = p.id and t.deleted_at is null and t.archived_at is null) as task_count,
        (select count(*) from tasks t where t.workspace_id = p.workspace_id and t.project_id = p.id and t.deleted_at is null and t.archived_at is null and t.status <> 'done') as open_task_count,
        p.created_at
      from projects p
      where p.workspace_id = ${member.workspaceId} and ${projectVisibleSql(member)}
        ${projectId ? sql`and p.id = ${projectId}` : sql``}
      order by p.parent_id nulls first, p.name, p.id`;
  }

  private view(member: MembershipContext, row: ProjectListRow): ProjectView {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      departmentId: row.department_id,
      color: row.color,
      parentId: row.parent_id,
      visibility: row.visibility,
      archived: row.archived,
      starred: row.starred,
      myRole: row.my_role,
      myActions: projectActions(member, { visibility: row.visibility, role: row.my_role }),
      memberIds: row.member_ids,
      taskCount: num(row.task_count),
      openTaskCount: num(row.open_task_count),
      createdAt: iso(row.created_at),
    };
  }

  /** Projects nest one level deep: the parent must be a visible top-level project, not `self`. */
  private async assertParent(tx: Tx, member: MembershipContext, parentId: string, self: string | null): Promise<void> {
    if (parentId === self) throw ApiError.validation([{ field: 'parentId', message: 'a project cannot be its own parent' }]);
    let parent: ProjectRow;
    try {
      ({ project: parent } = await this.access.project(tx, member, parentId));
    } catch {
      throw ApiError.validation([{ field: 'parentId', message: 'unknown project' }]);
    }
    if (parent.parentId) throw ApiError.validation([{ field: 'parentId', message: 'sub-projects cannot have sub-projects' }]);
    if (self) {
      const [children] = await tx
        .select({ n: count() })
        .from(projects)
        .where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.parentId, self), isNull(projects.deletedAt)));
      if ((children?.n ?? 0) > 0) throw ApiError.validation([{ field: 'parentId', message: 'a project with sub-projects cannot become one' }]);
    }
  }

  private async targetMember(tx: Tx, workspaceId: string, projectId: string, userId: string): Promise<{ roleKey: string; projectRole: ProjectRole | null }> {
    const result = await tx.execute<{ status: string; role_key: string; project_role: ProjectRole | null }>(sql`
      select m.status, r.key as role_key,
        (select pm.role from project_members pm where pm.project_id = ${projectId} and pm.user_id = m.user_id) as project_role
      from workspace_members m
      join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      where m.workspace_id = ${workspaceId} and m.user_id = ${userId}`);
    const row = result.rows[0];
    if (!row || row.status !== 'active') throw ApiError.validation([{ field: 'userId', message: 'not an active member of the workspace' }]);
    return { roleKey: row.role_key, projectRole: row.project_role };
  }

  private async membershipChanged(unit: Unit, member: MembershipContext, projectId: string, userId: string, role: ProjectRole | null, before: ProjectRole | null): Promise<void> {
    await this.memberships.bump(unit, member.workspaceId);
    await this.audit.write(unit.tx, {
      action: role ? 'project.member.put' : 'project.member.remove',
      workspaceId: member.workspaceId,
      resourceType: 'project',
      resourceId: projectId,
      changes: { userId, before: { role: before }, after: { role } },
    });
    await this.outbox.add(
      unit.tx,
      { type: 'project.member.changed', aggregateType: 'project', aggregateId: projectId, workspaceId: member.workspaceId, payload: { projectId, userId, role } },
      { type: 'rbac.changed', aggregateType: 'workspace', aggregateId: member.workspaceId, workspaceId: member.workspaceId, payload: { workspaceId: member.workspaceId, userIds: [userId] } },
    );
  }
}

