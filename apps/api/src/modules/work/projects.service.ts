import { Injectable, Logger } from '@nestjs/common';
import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type {
  CreateProjectBody,
  PermissionActionId,
  ProjectMemberView,
  ProjectRole,
  ProjectView,
  ProjectVisibility,
  TrashedProjectView,
  UpdateProjectBody,
} from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { isUniqueViolation, PG, pgError } from '../../platform/db/pg-errors.js';
import { EFFECTIVE_LIMITS } from '../../platform/db/plan-limits.js';
import { iso, num } from '../../platform/db/rows.js';
import { calendarEvents, plans, projectMembers, projects, projectStars, tasks, workflows, workspaces } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { openProjectChannel, renameProjectChannels, setProjectChannelsArchived, syncProjectChannelMember } from '../chat/project-channels.js';
import { AbilityFactory, effectiveProjectRole, PROJECT_ROLE_ACTIONS, projectActions } from '../rbac/ability.js';
import { MembershipService } from '../rbac/membership.service.js';
import { AccessService, assertAction, projectVisibleSql } from './access.js';
import { createProjectWorkflow } from './board.service.js';

/** Days a deleted project stays in the trash, restorable by the workspace owner, before its purge. */
export const PROJECT_TRASH_DAYS = 40;

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

/** Deleting, restoring and emptying the trash are the workspace owner's alone. */
function assertWorkspaceOwner(member: MembershipContext): void {
  if (!member.isOwner) throw ApiError.forbidden('Only the workspace owner can delete or restore projects.');
}

interface TrashRow extends Record<string, unknown> {
  id: string;
  key: string;
  name: string;
  color: TrashedProjectView['color'];
  department_id: string | null;
  task_count: string | number;
  deleted_at: string;
  deleted_by: string | null;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger('ProjectsService');

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
        .select({ maxProjects: sql<number | null>`(${EFFECTIVE_LIMITS} ->> 'maxProjects')::int` })
        .from(workspaces)
        .innerJoin(plans, eq(plans.id, workspaces.planId))
        .where(eq(workspaces.id, member.workspaceId))
        .for('update', { of: workspaces });
      if (!workspace) throw ApiError.notFound('The workspace');
      if (workspace.maxProjects !== null) {
        const [live] = await tx.select({ n: count() }).from(projects).where(and(eq(projects.workspaceId, member.workspaceId), isNull(projects.deletedAt)));
        if ((live?.n ?? 0) >= workspace.maxProjects) throw new ApiError('PLAN_LIMIT_REACHED', `This plan allows ${workspace.maxProjects} projects.`);
      }
      // Everyone named joins as a contributor (the most a guest may be); they must be active members.
      const others = [...new Set(body.memberIds ?? [])].filter((userId) => userId !== member.userId);
      for (const userId of others) await this.targetMember(tx, member.workspaceId, null, userId);
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
            visibility: body.visibility ?? 'workspace',
            workflowId: workflow.id,
            createdBy: member.userId,
          })
          .returning({ id: projects.id, key: projects.key, name: projects.name, visibility: projects.visibility });
        if (!created) throw new Error('project insert returned nothing');
        // The creator leads the project (a guest creator is capped at contributor by the ability).
        await tx.insert(projectMembers).values([
          { workspaceId: member.workspaceId, projectId: created.id, userId: member.userId, role: 'lead', addedBy: member.userId },
          ...others.map((userId) => ({ workspaceId: member.workspaceId, projectId: created.id, userId, role: 'contributor' as const, addedBy: member.userId })),
        ]);
        // Its chat channel opens with it, with the same people (RFC §4.3, `project_synced`).
        await openProjectChannel(tx, this.outbox, {
          workspaceId: member.workspaceId,
          projectId: created.id,
          name: created.name,
          description: body.description ?? '',
          color: body.color ?? 'brand',
          createdBy: member.userId,
          members: others.map((userId) => ({ userId, role: 'contributor' as const })),
        });
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
            ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
            ...(body.archived !== undefined ? { archivedAt: body.archived ? (project.archivedAt ?? sql`now()`) : null } : {}),
          })
          .where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.id, projectId)));
      } catch (error) {
        if (pgError(error)?.code === PG.foreignKeyViolation) throw ApiError.validation([{ field: 'departmentId', message: 'unknown department' }]);
        throw error;
      }
      if (body.visibility !== undefined && body.visibility !== project.visibility) await this.memberships.bump(unit, member.workspaceId);
      if (body.name !== undefined && body.name.trim() !== project.name) await renameProjectChannels(tx, this.outbox, member.workspaceId, projectId, body.name);
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

  /**
   * Moves the project to the trash (workspace owner only). It disappears at once — tree, boards,
   * tasks, calendar, search and its chat channel — and stays restorable for {@link PROJECT_TRASH_DAYS}
   * days, when the purge removes it and its tasks for good.
   */
  async remove(member: MembershipContext, projectId: string): Promise<void> {
    assertWorkspaceOwner(member);
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId, includeDeleted: true }, async (unit) => {
      const tx = unit.tx;
      const { project } = await this.access.project(tx, member, projectId, { lock: 'update' });
      await tx
        .update(projects)
        .set({ deletedAt: sql`now()`, deletedBy: member.userId })
        .where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.id, projectId)));
      await setProjectChannelsArchived(tx, this.outbox, member.workspaceId, projectId, true);
      await this.memberships.bump(unit, member.workspaceId);
      await this.audit.write(tx, { action: 'project.delete', workspaceId: member.workspaceId, resourceType: 'project', resourceId: projectId, changes: { before: { key: project.key, name: project.name } } });
      await this.outbox.add(tx, { type: 'project.deleted', aggregateType: 'project', aggregateId: projectId, workspaceId: member.workspaceId, payload: { projectId } });
    });
  }

  /** The trash: projects deleted in the last {@link PROJECT_TRASH_DAYS} days, newest first (owner only). */
  async trash(member: MembershipContext): Promise<TrashedProjectView[]> {
    assertWorkspaceOwner(member);
    const result = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId, includeDeleted: true }, ({ tx }) =>
      tx.execute<TrashRow>(sql`
        select p.id, p.key, p.name, p.color, p.department_id, p.deleted_at, p.deleted_by,
          (select count(*) from tasks t where t.workspace_id = p.workspace_id and t.project_id = p.id and t.deleted_at is null) as task_count
        from projects p
        where p.workspace_id = ${member.workspaceId} and p.deleted_at is not null
        order by p.deleted_at desc, p.id`),
    );
    return result.rows.map((row) => {
      const deletedAt = new Date(row.deleted_at);
      return {
        id: row.id,
        key: row.key,
        name: row.name,
        color: row.color,
        departmentId: row.department_id,
        taskCount: num(row.task_count),
        deletedAt: deletedAt.toISOString(),
        deletedBy: row.deleted_by,
        purgeAt: new Date(deletedAt.getTime() + PROJECT_TRASH_DAYS * 86_400_000).toISOString(),
      };
    });
  }

  /**
   * «بازیابی»: brings a project back from the trash as it was — tasks, board, members and its
   * channel. It counts against the plan again, and its key must still be free.
   */
  async restore(member: MembershipContext, projectId: string): Promise<ProjectView> {
    assertWorkspaceOwner(member);
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId, includeDeleted: true }, async (unit) => {
      const tx = unit.tx;
      // The workspace row first (canonical lock order): it serialises the plan's project count.
      const [workspace] = await tx
        .select({ maxProjects: sql<number | null>`(${EFFECTIVE_LIMITS} ->> 'maxProjects')::int` })
        .from(workspaces)
        .innerJoin(plans, eq(plans.id, workspaces.planId))
        .where(eq(workspaces.id, member.workspaceId))
        .for('update', { of: workspaces });
      if (!workspace) throw ApiError.notFound('The workspace');
      const [project] = await tx
        .select({ id: projects.id, key: projects.key, name: projects.name })
        .from(projects)
        .where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.id, projectId), isNotNull(projects.deletedAt)))
        .for('update');
      if (!project) throw ApiError.notFound('The project in the trash');
      if (workspace.maxProjects !== null) {
        const [live] = await tx.select({ n: count() }).from(projects).where(and(eq(projects.workspaceId, member.workspaceId), isNull(projects.deletedAt)));
        if ((live?.n ?? 0) >= workspace.maxProjects) throw new ApiError('PLAN_LIMIT_REACHED', `This plan allows ${workspace.maxProjects} projects.`);
      }
      try {
        await tx.update(projects).set({ deletedAt: null, deletedBy: null }).where(and(eq(projects.workspaceId, member.workspaceId), eq(projects.id, projectId)));
      } catch (error) {
        if (isUniqueViolation(error, 'projects_ws_key_uq')) throw new ApiError('PROJECT_KEY_TAKEN', `Another project now uses the key ${project.key}.`);
        throw error;
      }
      await setProjectChannelsArchived(tx, this.outbox, member.workspaceId, projectId, false);
      await this.memberships.bump(unit, member.workspaceId);
      await this.audit.write(tx, { action: 'project.restore', workspaceId: member.workspaceId, resourceType: 'project', resourceId: projectId, changes: { after: { key: project.key, name: project.name } } });
      await this.outbox.add(tx, { type: 'project.restored', aggregateType: 'project', aggregateId: projectId, workspaceId: member.workspaceId, payload: { projectId } });
    });
    return this.get(member, projectId);
  }

  /**
   * Worker: removes projects that spent {@link PROJECT_TRASH_DAYS} days in the trash — their tasks
   * (with subtasks, comments and links), board and memberships. Calendar events and the chat
   * channel stay, no longer linked to a project; messages are never deleted with a project.
   */
  async purgeDue(limit = 20): Promise<number> {
    const due = await this.uow.run({ workspaceId: null, userId: null }, ({ tx }) =>
      tx.execute<{ workspace_id: string; project_id: string }>(sql`select * from app.projects_due_for_purge(${PROJECT_TRASH_DAYS}, ${limit})`),
    );
    let purged = 0;
    for (const { workspace_id: workspaceId, project_id: projectId } of due.rows) {
      await this.uow.run({ workspaceId, userId: null, includeDeleted: true }, async (unit) => {
        const tx = unit.tx;
        const [project] = await tx
          .select({ key: projects.key, name: projects.name, workflowId: projects.workflowId })
          .from(projects)
          .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId), isNotNull(projects.deletedAt)))
          .for('update');
        if (!project) return; // Restored meanwhile.
        await tx.delete(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.projectId, projectId)));
        await tx.update(calendarEvents).set({ projectId: null }).where(and(eq(calendarEvents.workspaceId, workspaceId), eq(calendarEvents.projectId, projectId)));
        await tx.delete(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)));
        await tx.delete(workflows).where(and(eq(workflows.workspaceId, workspaceId), eq(workflows.id, project.workflowId)));
        await this.audit.write(tx, {
          action: 'project.purge',
          workspaceId,
          actorUserId: null,
          resourceType: 'project',
          resourceId: projectId,
          changes: { before: { key: project.key, name: project.name } },
        });
      });
      this.logger.log({ workspaceId, projectId }, 'project purged');
      purged += 1;
    }
    return purged;
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
      await syncProjectChannelMember(tx, this.outbox, { workspaceId: member.workspaceId, projectId, userId, role });
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
      await syncProjectChannelMember(tx, this.outbox, { workspaceId: member.workspaceId, projectId, userId, role: null });
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
        coalesce((select array_agg(pm.user_id order by pm.added_at, pm.user_id) from project_members pm
                  join workspace_members m on m.workspace_id = pm.workspace_id and m.user_id = pm.user_id and m.status <> 'left'
                  where pm.project_id = p.id), '{}') as member_ids,
        (select count(*) from tasks t where t.workspace_id = p.workspace_id and t.project_id = p.id and t.deleted_at is null and t.archived_at is null) as task_count,
        (select count(*) from tasks t where t.workspace_id = p.workspace_id and t.project_id = p.id and t.deleted_at is null and t.archived_at is null and t.status <> 'done') as open_task_count,
        p.created_at
      from projects p
      where p.workspace_id = ${member.workspaceId} and ${projectVisibleSql(member)}
        ${projectId ? sql`and p.id = ${projectId}` : sql``}
      order by p.name, p.id`;
  }

  private view(member: MembershipContext, row: ProjectListRow): ProjectView {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      departmentId: row.department_id,
      color: row.color,
      // Projects are flat (Phase 3.1).
      parentId: null,
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

  private async targetMember(tx: Tx, workspaceId: string, projectId: string | null, userId: string): Promise<{ roleKey: string; projectRole: ProjectRole | null }> {
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

