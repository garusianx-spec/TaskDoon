import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type {
  CreateDependencyBody,
  CreateWorklogBody,
  TaskDependencyType,
  TaskDependencyView,
  TaskStatus,
  WorklogList,
  WorklogView,
} from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { Clock } from '../../platform/clock/clock.js';
import type { Tx } from '../../platform/db/database.js';
import { PG, pgError } from '../../platform/db/pg-errors.js';
import { iso, num } from '../../platform/db/rows.js';
import { taskDependencies, taskEvents, tasks, taskWorklogs } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { AccessService, assertAction, type ProjectAccess } from './access.js';

type TaskRow = typeof tasks.$inferSelect;
type WorklogRow = typeof taskWorklogs.$inferSelect;

/** Newest worklogs a list returns; the total always covers them all. */
const WORKLOG_PAGE = 500;

/** A worklog may be dated a little ahead (clock skew), never into the future. */
const FUTURE_SLACK_MS = 5 * 60_000;

/** The same edge seen from its other end. */
const INVERSE: Record<TaskDependencyType, TaskDependencyType> = { blocks: 'blocked_by', blocked_by: 'blocks', relates_to: 'relates_to' };

interface DependencyRow extends Record<string, unknown> {
  id: string;
  type: TaskDependencyType;
  source_task_id: string;
  created_at: string;
  other_id: string;
  code: string;
  title: string;
  status: TaskStatus;
}

/**
 * Agile tracking on one task: time logged against it and its links to other tasks of the
 * project. Routes name the project and the task; a task that is not (or no longer) in that
 * project, or that the caller cannot see, is a 404. Neither changes the task's `version` (like
 * subtasks), so its viewers are told through `task.updated` with `fields` naming what changed.
 */
@Injectable()
export class AgileService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly access: AccessService,
    private readonly clock: Clock,
  ) {}

  /* ================================================================== worklogs */

  async worklogs(member: MembershipContext, projectId: string, taskId: string): Promise<WorklogList> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const { task } = await this.taskIn(tx, member, projectId, taskId);
      const mine = and(eq(taskWorklogs.workspaceId, member.workspaceId), eq(taskWorklogs.taskId, taskId));
      const rows = await tx.select().from(taskWorklogs).where(mine).orderBy(desc(taskWorklogs.loggedAt), desc(taskWorklogs.id)).limit(WORKLOG_PAGE);
      const [total] = await tx.select({ minutes: sql<string>`coalesce(sum(${taskWorklogs.durationMinutes}), 0)` }).from(taskWorklogs).where(mine);
      return { items: rows.map(worklogView), totalMinutes: num(total?.minutes ?? 0), estimatedMinutes: task.estimatedMinutes };
    });
  }

  async logWork(member: MembershipContext, projectId: string, taskId: string, body: CreateWorklogBody): Promise<WorklogView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.taskIn(tx, member, projectId, taskId);
      assertAction(access.actions, 'edit', 'Logging time needs the edit permission in this project.');
      const loggedAt = body.loggedAt ? new Date(body.loggedAt) : null;
      if (loggedAt && loggedAt.getTime() > this.clock.now().getTime() + FUTURE_SLACK_MS) {
        throw ApiError.validation([{ field: 'loggedAt', message: 'must not be in the future' }]);
      }
      const [row] = await tx
        .insert(taskWorklogs)
        .values({
          workspaceId: member.workspaceId,
          taskId,
          userId: member.userId,
          durationMinutes: body.durationMinutes,
          description: body.description?.trim() ?? '',
          ...(loggedAt ? { loggedAt } : {}),
        })
        .returning();
      if (!row) throw new Error('worklog insert returned nothing');
      await this.event(tx, member, taskId, 'worklog.added', { worklogId: row.id, minutes: row.durationMinutes });
      await this.audit.write(tx, {
        action: 'task.worklog.create',
        workspaceId: member.workspaceId,
        resourceType: 'task',
        resourceId: taskId,
        changes: { after: { worklogId: row.id, durationMinutes: row.durationMinutes } },
      });
      await this.changed(tx, member, task, 'worklogs');
      return worklogView(row);
    });
  }

  /** One's own entries need `edit`; someone else's need `delete`. */
  async removeWorklog(member: MembershipContext, projectId: string, taskId: string, worklogId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.taskIn(tx, member, projectId, taskId);
      const [row] = await tx
        .select()
        .from(taskWorklogs)
        .where(and(eq(taskWorklogs.workspaceId, member.workspaceId), eq(taskWorklogs.taskId, taskId), eq(taskWorklogs.id, worklogId)));
      if (!row) throw ApiError.notFound('The worklog');
      if (row.userId === member.userId) assertAction(access.actions, 'edit');
      else assertAction(access.actions, 'delete', "Removing someone else's time needs the delete permission.");
      await tx.delete(taskWorklogs).where(and(eq(taskWorklogs.workspaceId, member.workspaceId), eq(taskWorklogs.id, worklogId)));
      await this.event(tx, member, taskId, 'worklog.removed', { worklogId, minutes: row.durationMinutes });
      await this.audit.write(tx, {
        action: 'task.worklog.delete',
        workspaceId: member.workspaceId,
        resourceType: 'task',
        resourceId: taskId,
        changes: { before: { worklogId, userId: row.userId, durationMinutes: row.durationMinutes } },
      });
      await this.changed(tx, member, task, 'worklogs');
    });
  }

  /* ================================================================== dependencies */

  /** The task's links, each from its side, oldest first; links to deleted tasks are left out. */
  async dependencies(member: MembershipContext, projectId: string, taskId: string): Promise<TaskDependencyView[]> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      await this.taskIn(tx, member, projectId, taskId);
      const rows = await tx.execute<DependencyRow>(sql`
        select d.id, d.type, d.source_task_id, d.created_at, o.id as other_id, p.key || '-' || o.number as code, o.title, o.status
        from task_dependencies d
        join tasks o on o.workspace_id = d.workspace_id
          and o.id = case when d.source_task_id = ${taskId} then d.target_task_id else d.source_task_id end
        join projects p on p.workspace_id = o.workspace_id and p.id = o.project_id
        where d.workspace_id = ${member.workspaceId} and (d.source_task_id = ${taskId} or d.target_task_id = ${taskId}) and o.deleted_at is null
        order by d.created_at, d.id`);
      return rows.rows.map((row) => ({
        id: row.id,
        type: row.source_task_id === taskId ? row.type : INVERSE[row.type],
        task: { id: row.other_id, code: row.code, title: row.title, status: row.status },
        createdAt: iso(row.created_at),
      }));
    });
  }

  /**
   * Links the task to another of its project. Links of one project are added one at a time (an
   * advisory lock), so two requests cannot each close half of a cycle: a blocking link whose
   * blocked task already blocks, directly or through others, its blocker is 409 DEPENDENCY_CYCLE.
   */
  async link(member: MembershipContext, projectId: string, taskId: string, body: CreateDependencyBody): Promise<TaskDependencyView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.taskIn(tx, member, projectId, taskId);
      assertAction(access.actions, 'edit', 'Linking tasks needs the edit permission in this project.');
      if (body.targetTaskId === taskId) throw ApiError.validation([{ field: 'targetTaskId', message: 'a task cannot depend on itself' }]);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`task_dependencies:${projectId}`}, 0))`);
      const target = await this.targetOf(tx, member, projectId, body.targetTaskId);

      const [existing] = await tx
        .select({ id: taskDependencies.id })
        .from(taskDependencies)
        .where(
          and(
            eq(taskDependencies.workspaceId, member.workspaceId),
            or(
              and(eq(taskDependencies.sourceTaskId, taskId), eq(taskDependencies.targetTaskId, target.id)),
              and(eq(taskDependencies.sourceTaskId, target.id), eq(taskDependencies.targetTaskId, taskId)),
            ),
          ),
        );
      if (existing) throw new ApiError('DEPENDENCY_EXISTS');
      if (body.type !== 'relates_to') {
        const [blocker, blocked] = body.type === 'blocks' ? [taskId, target.id] : [target.id, taskId];
        if (await this.reaches(tx, member, projectId, blocked, blocker)) throw new ApiError('DEPENDENCY_CYCLE');
      }

      let row: typeof taskDependencies.$inferSelect | undefined;
      try {
        [row] = await tx
          .insert(taskDependencies)
          .values({ workspaceId: member.workspaceId, projectId, sourceTaskId: taskId, targetTaskId: target.id, type: body.type, createdBy: member.userId })
          .returning();
      } catch (error) {
        if (pgError(error)?.code === PG.uniqueViolation) throw new ApiError('DEPENDENCY_EXISTS');
        throw error;
      }
      if (!row) throw new Error('dependency insert returned nothing');
      await this.event(tx, member, taskId, 'dependency.added', { dependencyId: row.id, type: body.type, taskId: target.id });
      await this.event(tx, member, target.id, 'dependency.added', { dependencyId: row.id, type: INVERSE[body.type], taskId });
      await this.audit.write(tx, {
        action: 'task.dependency.create',
        workspaceId: member.workspaceId,
        resourceType: 'task',
        resourceId: taskId,
        changes: { after: { dependencyId: row.id, type: body.type, targetTaskId: target.id } },
      });
      await this.changed(tx, member, task, 'dependencies');
      await this.changed(tx, member, target, 'dependencies');
      return {
        id: row.id,
        type: body.type,
        task: { id: target.id, code: `${access.project.key}-${target.number}`, title: target.title, status: target.status },
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async unlink(member: MembershipContext, projectId: string, taskId: string, dependencyId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.taskIn(tx, member, projectId, taskId);
      assertAction(access.actions, 'edit', 'Unlinking tasks needs the edit permission in this project.');
      const [row] = await tx
        .select()
        .from(taskDependencies)
        .where(
          and(
            eq(taskDependencies.workspaceId, member.workspaceId),
            eq(taskDependencies.id, dependencyId),
            or(eq(taskDependencies.sourceTaskId, taskId), eq(taskDependencies.targetTaskId, taskId)),
          ),
        );
      if (!row) throw ApiError.notFound('The dependency');
      await tx.delete(taskDependencies).where(and(eq(taskDependencies.workspaceId, member.workspaceId), eq(taskDependencies.id, dependencyId)));
      const otherId = row.sourceTaskId === taskId ? row.targetTaskId : row.sourceTaskId;
      await this.event(tx, member, taskId, 'dependency.removed', { dependencyId, taskId: otherId });
      await this.audit.write(tx, {
        action: 'task.dependency.delete',
        workspaceId: member.workspaceId,
        resourceType: 'task',
        resourceId: taskId,
        changes: { before: { dependencyId, type: row.type, sourceTaskId: row.sourceTaskId, targetTaskId: row.targetTaskId } },
      });
      await this.changed(tx, member, task, 'dependencies');
      const [other] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.id, otherId), isNull(tasks.deletedAt)));
      if (other) await this.changed(tx, member, other, 'dependencies');
    });
  }

  /* ================================================================== helpers */

  private scope(member: MembershipContext) {
    return { workspaceId: member.workspaceId, userId: member.userId };
  }

  /** The live task `taskId` of project `projectId`, with the caller's access to the project. */
  private async taskIn(tx: Tx, member: MembershipContext, projectId: string, taskId: string): Promise<{ task: TaskRow; access: ProjectAccess }> {
    let access: ProjectAccess;
    try {
      access = await this.access.project(tx, member, projectId);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') throw ApiError.notFound('The task');
      throw error;
    }
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
    if (!task) throw ApiError.notFound('The task');
    return { task, access };
  }

  /**
   * The other end of a new link: a live task of the same project. One in another project the
   * caller can see is 422 DEPENDENCY_CROSS_PROJECT; one they cannot see does not exist for them.
   */
  private async targetOf(tx: Tx, member: MembershipContext, projectId: string, targetTaskId: string): Promise<TaskRow> {
    const [target] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.id, targetTaskId), isNull(tasks.deletedAt)));
    if (!target) throw ApiError.notFound('The linked task');
    if (target.projectId === projectId) return target;
    try {
      await this.access.project(tx, member, target.projectId);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') throw ApiError.notFound('The linked task');
      throw error;
    }
    throw new ApiError('DEPENDENCY_CROSS_PROJECT');
  }

  /**
   * Whether `to` can be reached from `from` along blocking edges (blocker → blocked) of the
   * project's live tasks. `blocked_by` rows are read reversed.
   */
  private async reaches(tx: Tx, member: MembershipContext, projectId: string, from: string, to: string): Promise<boolean> {
    const result = await tx.execute<{ found: boolean }>(sql`
      with recursive edges as (
        select case when d.type = 'blocks' then d.source_task_id else d.target_task_id end as blocker_id,
               case when d.type = 'blocks' then d.target_task_id else d.source_task_id end as blocked_id
        from task_dependencies d
        join tasks s on s.workspace_id = d.workspace_id and s.id = d.source_task_id and s.deleted_at is null
        join tasks g on g.workspace_id = d.workspace_id and g.id = d.target_task_id and g.deleted_at is null
        where d.workspace_id = ${member.workspaceId} and d.project_id = ${projectId} and d.type <> 'relates_to'
      ),
      reach(id) as (
        select ${from}::uuid
        union
        select e.blocked_id from edges e join reach r on e.blocker_id = r.id
      )
      select exists (select 1 from reach where id = ${to}::uuid) as found`);
    return result.rows[0]?.found === true;
  }

  private async event(tx: Tx, member: MembershipContext, taskId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    await tx.insert(taskEvents).values({ workspaceId: member.workspaceId, taskId, actorId: member.userId, type, payload });
  }

  /** Tells the task's viewers what changed; its version stays (clients refetch on these fields). */
  private async changed(tx: Tx, member: MembershipContext, task: TaskRow, field: 'worklogs' | 'dependencies'): Promise<void> {
    await this.outbox.add(tx, {
      type: 'task.updated',
      aggregateType: 'task',
      aggregateId: task.id,
      workspaceId: member.workspaceId,
      payload: { taskId: task.id, projectId: task.projectId, version: task.version, fields: [field] },
    });
  }
}

export function worklogView(row: WorklogRow): WorklogView {
  return {
    id: row.id,
    taskId: row.taskId,
    userId: row.userId,
    durationMinutes: row.durationMinutes,
    description: row.description,
    loggedAt: row.loggedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
