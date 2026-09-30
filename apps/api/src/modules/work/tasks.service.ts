import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type {
  BoardView,
  CompleteTaskBody,
  CreateCommentBody,
  CreateSubtaskBody,
  CreateTaskBody,
  MoveSubtaskBody,
  MoveTaskBody,
  PermissionActionId,
  SubtaskView,
  TaskCard,
  TaskCommentView,
  TaskDetail,
  TaskPage,
  TaskPreview,
  TaskSourceMessage,
  TaskStatus,
  UpdateSubtaskBody,
  UpdateTaskBody,
} from '@taskin/contracts';
import { normaliseForSearch } from '@taskin/text';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { Clock, dateIn } from '../../platform/clock/clock.js';
import type { Tx } from '../../platform/db/database.js';
import { PG, pgError } from '../../platform/db/pg-errors.js';
import { iso, isoOrNull, num } from '../../platform/db/rows.js';
import {
  attachments,
  boardColumns,
  labels,
  subtasks,
  taskAssignees,
  taskAttachments,
  taskComments,
  taskEvents,
  taskLabels,
  tasks,
  taskStars,
  workspaces,
} from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { messageGrant, publicChannelVisible } from '../chat/chat-access.js';
import { projectActions } from '../rbac/ability.js';
import { AccessService, assertAction, type ProjectAccess, type ProjectRow } from './access.js';
import { BoardService } from './board.service.js';
import { keyBetween, keysBetween, REBALANCE_KEY_LENGTH } from './positions.js';
import {
  boardHeaderQuery,
  type BoardHeaderRow,
  boardTasksQuery,
  type CardRow,
  cardQuery,
  type DetailRow,
  detailQuery,
  ganttQuery,
  type ListFilter,
  listQuery,
  type SourceMessageRow,
  nextCursor,
  toCard,
  toColumns,
} from './task-queries.js';

type TaskRow = typeof tasks.$inferSelect;
type ColumnRow = typeof boardColumns.$inferSelect;

/** Extras for tasks created from something else: a note, or a chat message. */
export interface TaskOrigin {
  readonly sourceNoteId?: string;
  readonly sourceMessageId?: string;
  /**
   * Files of the source message, linked whoever uploaded them. The caller has already checked
   * that they belong to the message; `attachmentIds` in the body stay limited to one's own uploads.
   */
  readonly sourceAttachmentIds?: readonly string[];
}

const EXCERPT = 140;

/**
 * Tasks: one use case, one transaction. Locks follow the canonical order (project → column →
 * task): creating a task locks its project row (numbering) and the target column (ordering);
 * moving locks the target column, then the task. Every change bumps the task's `version`, checked
 * against `If-Match` / `expectedVersion`.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly access: AccessService,
    private readonly board: BoardService,
    private readonly clock: Clock,
  ) {}

  /* ================================================================== reads */

  /** The board of a project: columns plus every visible card, in two statements after the tenant setup. */
  async boardView(member: MembershipContext, projectId: string): Promise<BoardView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const header = (await tx.execute<BoardHeaderRow>(boardHeaderQuery(member, projectId))).rows[0];
      if (!header?.visible) throw ApiError.notFound('The project');
      const cards = await tx.execute<CardRow>(boardTasksQuery(member, projectId));
      return { workflowId: header.workflow_id, workflowVersion: header.version, columns: toColumns(header.columns), tasks: cards.rows.map(toCard) };
    });
  }

  async list(member: MembershipContext, filter: Omit<ListFilter, 'now'>): Promise<TaskPage> {
    const rows = await this.uow.run(this.scope(member), ({ tx }) => tx.execute<CardRow>(listQuery(member, { ...filter, now: this.clock.now() })));
    return { items: rows.rows.slice(0, filter.limit).map(toCard), nextCursor: nextCursor(filter.smart, rows.rows, filter.limit) };
  }

  async gantt(member: MembershipContext, range: { projectId?: string; from: string; to: string }): Promise<TaskCard[]> {
    const rows = await this.uow.run(this.scope(member), ({ tx }) => tx.execute<CardRow>(ganttQuery(member, range, 2000)));
    return rows.rows.map(toCard);
  }

  /** One task in full, in one statement; invisible tasks are 404. */
  async detail(member: MembershipContext, taskId: string): Promise<TaskDetail> {
    const result = await this.uow.run(this.scope(member), ({ tx }) => tx.execute<DetailRow>(detailQuery(member, taskId)));
    const row = result.rows[0];
    const actions = row ? projectActions(member, { visibility: row.project_visibility, role: row.my_role }) : [];
    if (!row || !actions.includes('view')) throw ApiError.notFound('The task');
    return toDetail(row, actions, member);
  }

  /** What a chat member may know about a linked task: the code always, the rest only with access. */
  async preview(member: MembershipContext, taskId: string): Promise<TaskPreview> {
    const result = await this.uow.run(this.scope(member), ({ tx }) => tx.execute<DetailRow>(detailQuery(member, taskId)));
    const row = result.rows[0];
    if (!row) throw ApiError.notFound('The task');
    const visible = projectActions(member, { visibility: row.project_visibility, role: row.my_role }).includes('view');
    return visible
      ? { id: row.id, code: row.code, accessible: true, title: row.title, status: row.status, projectId: row.project_id }
      : { id: row.id, code: row.code, accessible: false, title: null, status: null, projectId: null };
  }

  /* ================================================================== create */

  async create(member: MembershipContext, body: CreateTaskBody): Promise<TaskDetail> {
    const id = await this.uow.run(this.scope(member), (unit) => this.createIn(unit, member, body));
    return this.detail(member, id);
  }

  /** Creates a task inside the caller's unit (note conversion shares its transaction). */
  async createIn(unit: Unit, member: MembershipContext, body: CreateTaskBody, origin: TaskOrigin = {}): Promise<string> {
    const tx = unit.tx;
    const access = await this.access.project(tx, member, body.projectId, { lock: 'update' });
    const { project, actions } = access;
    if (project.archivedAt) throw new ApiError('PROJECT_ARCHIVED');
    assertAction(actions, 'create');
    const assigneeIds = [...new Set(body.assigneeIds ?? [])];
    if (assigneeIds.length > 0 || body.reviewerId) assertAction(actions, 'assign', 'Assigning people needs the assign permission.');
    await this.access.assertCanView(tx, member.workspaceId, project.id, project.visibility, [...assigneeIds, ...(body.reviewerId ? [body.reviewerId] : [])]);

    const column = await this.resolveColumn(tx, member, project, body.columnId ?? null, body.status ?? 'todo');
    const [first] = await tx
      .select({ position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.columnId, column.id), isNull(tasks.deletedAt), isNull(tasks.archivedAt)))
      .orderBy(asc(tasks.position))
      .limit(1);
    const position = keyBetween(null, first?.position ?? null);
    const startDate = body.startDate ?? (await this.today(tx, member.workspaceId));
    if (body.dueDate && body.dueDate < startDate) throw ApiError.validation([{ field: 'dueDate', message: 'must not be before the start date' }]);

    const [numbered] = await tx.execute<{ task_seq: string }>(sql`
      update projects set task_seq = task_seq + 1 where workspace_id = ${member.workspaceId} and id = ${project.id} returning task_seq`).then((r) => r.rows);
    const number = num(numbered?.task_seq);
    const code = `${project.key}-${number}`;
    const title = body.title.trim();
    const description = body.description?.trim() ?? '';
    const done = column.status === 'done';

    const [task] = await tx
      .insert(tasks)
      .values({
        workspaceId: member.workspaceId,
        projectId: project.id,
        number,
        title,
        description,
        columnId: column.id,
        status: column.status,
        position,
        priority: body.priority ?? 'medium',
        reviewerId: body.reviewerId ?? null,
        startDate,
        dueDate: body.dueDate ?? null,
        completedAt: done ? sql`now()` : null,
        sourceNoteId: origin.sourceNoteId ?? null,
        sourceMessageId: origin.sourceMessageId ?? null,
        createdBy: member.userId,
        searchText: normaliseForSearch(`${code} ${title} ${description}`),
      })
      .returning();
    if (!task) throw new Error('task insert returned nothing');

    if (assigneeIds.length > 0) {
      await tx.insert(taskAssignees).values(assigneeIds.map((userId) => ({ workspaceId: member.workspaceId, taskId: task.id, userId, assignedBy: member.userId })));
    }
    await this.setLabels(tx, member, task.id, body.labelIds ?? []);
    const titles = (body.subtasks ?? []).map((entry) => entry.trim()).filter(Boolean);
    if (titles.length > 0) {
      const keys = keysBetween(null, null, titles.length);
      await tx.insert(subtasks).values(titles.map((entry, index) => ({ workspaceId: member.workspaceId, taskId: task.id, title: entry, position: keys[index] ?? '' })));
    }
    for (const attachmentId of new Set(body.attachmentIds ?? [])) await this.linkFile(tx, member, task.id, attachmentId);
    for (const attachmentId of new Set(origin.sourceAttachmentIds ?? [])) await this.linkSourceFile(tx, member, task.id, attachmentId);

    await this.event(tx, member, task.id, 'created', {
      code,
      columnId: column.id,
      ...(origin.sourceNoteId ? { sourceNoteId: origin.sourceNoteId } : {}),
      ...(origin.sourceMessageId ? { sourceMessageId: origin.sourceMessageId } : {}),
    });
    await this.audit.write(tx, {
      action: 'task.create',
      workspaceId: member.workspaceId,
      resourceType: 'task',
      resourceId: task.id,
      changes: { after: { code, title, columnId: column.id, assigneeIds } },
    });
    await this.outbox.add(tx, { type: 'task.created', aggregateType: 'task', aggregateId: task.id, workspaceId: member.workspaceId, payload: { taskId: task.id, projectId: project.id, columnId: column.id, version: task.version } });
    const others = assigneeIds.filter((userId) => userId !== member.userId);
    if (others.length > 0) {
      await this.outbox.add(tx, {
        type: 'task.assigned',
        aggregateType: 'task',
        aggregateId: task.id,
        workspaceId: member.workspaceId,
        payload: { taskId: task.id, projectId: project.id, code, title, watcherIds: [], assigneeIds: others },
      });
    }
    return task.id;
  }

  /* ================================================================== update */

  async update(member: MembershipContext, taskId: string, ifMatch: number, body: UpdateTaskBody): Promise<TaskDetail> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.lockTask(tx, member, taskId);
      if (task.version !== ifMatch) throw ApiError.stale(await this.card(tx, member, taskId));
      const edits = (['title', 'description', 'priority', 'startDate', 'dueDate', 'labelIds'] as const).filter((field) => body[field] !== undefined);
      const assigns = (['assigneeIds', 'reviewerId'] as const).filter((field) => body[field] !== undefined);
      if (edits.length > 0) assertAction(access.actions, 'edit');
      if (assigns.length > 0) assertAction(access.actions, 'assign', 'Assigning people needs the assign permission.');
      const fields = [...edits, ...assigns];
      if (fields.length === 0) return;

      const startDate = body.startDate ?? task.startDate;
      const dueDate = body.dueDate === undefined ? task.dueDate : body.dueDate;
      if (dueDate && dueDate < startDate) throw ApiError.validation([{ field: 'dueDate', message: 'must not be before the start date' }]);
      const people = [...(body.assigneeIds ?? []), ...(body.reviewerId ? [body.reviewerId] : [])];
      await this.access.assertCanView(tx, member.workspaceId, access.project.id, access.project.visibility, people);

      const title = body.title?.trim() ?? task.title;
      const description = body.description?.trim() ?? task.description;
      const code = `${access.project.key}-${task.number}`;
      await tx
        .update(tasks)
        .set({
          title,
          description,
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          startDate,
          dueDate,
          ...(body.reviewerId !== undefined ? { reviewerId: body.reviewerId } : {}),
          searchText: normaliseForSearch(`${code} ${title} ${description}`),
          version: sql`${tasks.version} + 1`,
        })
        .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.id, taskId)));

      let added: string[] = [];
      if (body.assigneeIds !== undefined) {
        const wanted = new Set(body.assigneeIds);
        const current = (await tx.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).map((row) => row.userId);
        added = [...wanted].filter((userId) => !current.includes(userId));
        const removed = current.filter((userId) => !wanted.has(userId));
        if (removed.length > 0) await tx.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), inArray(taskAssignees.userId, removed)));
        if (added.length > 0) {
          await tx.insert(taskAssignees).values(added.map((userId) => ({ workspaceId: member.workspaceId, taskId, userId, assignedBy: member.userId })));
        }
        if (added.length > 0 || removed.length > 0) await this.event(tx, member, taskId, 'assigned', { added, removed });
      }
      if (body.labelIds !== undefined) await this.setLabels(tx, member, taskId, body.labelIds);

      await this.event(tx, member, taskId, 'updated', { fields });
      await this.audit.write(tx, {
        action: 'task.update',
        workspaceId: member.workspaceId,
        resourceType: 'task',
        resourceId: taskId,
        changes: { before: { title: task.title, priority: task.priority, dueDate: task.dueDate, reviewerId: task.reviewerId }, after: body },
      });
      await this.outbox.add(tx, {
        type: 'task.updated',
        aggregateType: 'task',
        aggregateId: taskId,
        workspaceId: member.workspaceId,
        payload: { taskId, projectId: task.projectId, version: task.version + 1, fields },
      });
      const notify = added.filter((userId) => userId !== member.userId);
      if (notify.length > 0) {
        await this.outbox.add(tx, {
          type: 'task.assigned',
          aggregateType: 'task',
          aggregateId: taskId,
          workspaceId: member.workspaceId,
          payload: { taskId, projectId: task.projectId, code, title, watcherIds: [], assigneeIds: notify },
        });
      }
    });
    return this.detail(member, taskId);
  }

  /** Soft delete: the card leaves the board; its source message or note can be converted again. */
  async remove(member: MembershipContext, taskId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.lockTask(tx, member, taskId);
      assertAction(access.actions, 'delete');
      await tx.update(tasks).set({ deletedAt: sql`now()`, version: sql`${tasks.version} + 1` }).where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.id, taskId)));
      await this.audit.write(tx, { action: 'task.delete', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { before: { title: task.title } } });
      await this.outbox.add(tx, { type: 'task.deleted', aggregateType: 'task', aggregateId: taskId, workspaceId: member.workspaceId, payload: { taskId, projectId: task.projectId } });
    });
  }

  /* ================================================================== move and complete */

  /**
   * Moves a card to `columnId` between `afterId` and `beforeId` (RFC §12). The target column is
   * locked first, so concurrent moves into it are serialised and each sees the others' positions:
   * no two cards ever get the same key. A deleted target column is 409 COLUMN_GONE.
   */
  async move(member: MembershipContext, taskId: string, body: MoveTaskBody): Promise<TaskCard> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const peek = await this.peekTask(tx, member, taskId);
      assertAction(peek.access.actions, 'assign', 'Moving cards needs the assign permission.');
      const column = await this.lockColumn(tx, member, peek.access.project, body.columnId);
      const { task } = await this.lockTask(tx, member, taskId);
      if (task.version !== body.expectedVersion) throw ApiError.stale(await this.card(tx, member, taskId));
      if (task.archivedAt) throw new ApiError('CONFLICT', 'Archived cards cannot move.');
      if (body.afterId === taskId || body.beforeId === taskId) throw ApiError.validation([{ field: 'afterId', message: 'a card cannot move next to itself' }]);

      let position = await this.positionIn(tx, member, column.id, taskId, body.afterId ?? null, body.beforeId ?? null);
      await this.place(tx, member, task, column, position);
      if (position.length > REBALANCE_KEY_LENGTH) position = await this.rebalance(tx, member, column.id, taskId);
      await this.afterPlacement(tx, member, task, peek.access.project, column, position, 'moved');
      return this.card(tx, member, taskId);
    });
  }

  /**
   * The quick-complete checkbox. Completing remembers the card's column and moves it to the first
   * done column; reopening moves it back there, or to the first to-do column when that column is
   * gone (the web app's `columnForPlacement`).
   */
  async complete(member: MembershipContext, taskId: string, body: CompleteTaskBody): Promise<TaskCard> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const peek = await this.peekTask(tx, member, taskId);
      assertAction(peek.access.actions, 'assign', 'Completing cards needs the assign permission.');
      if (peek.task.archivedAt) throw new ApiError('CONFLICT', 'Archived cards cannot move.');
      const isDone = peek.task.status === 'done';
      if (body.completed === isDone) {
        if (body.expectedVersion !== undefined && peek.task.version !== body.expectedVersion) throw ApiError.stale(await this.card(tx, member, taskId));
        return this.card(tx, member, taskId);
      }
      const columns = await this.board.liveColumns(tx, peek.access.project.workflowId);
      const targetId = body.completed
        ? columns.find((column) => column.status === 'done')?.id
        : (columns.find((column) => column.id === peek.task.reopenColumnId && column.status !== 'done') ?? columns.find((column) => column.status === 'todo'))?.id;
      if (!targetId) throw new ApiError('WORKFLOW_CATEGORY_REQUIRED');
      const column = await this.lockColumn(tx, member, peek.access.project, targetId);
      const { task } = await this.lockTask(tx, member, taskId);
      if (body.expectedVersion !== undefined && task.version !== body.expectedVersion) throw ApiError.stale(await this.card(tx, member, taskId));
      const position = await this.positionIn(tx, member, column.id, taskId, null, await this.firstIn(tx, member, column.id, taskId));
      await this.place(tx, member, task, column, position);
      await this.afterPlacement(tx, member, task, peek.access.project, column, position, body.completed ? 'completed' : 'reopened');
      return this.card(tx, member, taskId);
    });
  }

  /* ================================================================== stars */

  async star(member: MembershipContext, taskId: string, starred: boolean): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      await this.peekTask(tx, member, taskId);
      if (starred) {
        await tx.insert(taskStars).values({ workspaceId: member.workspaceId, taskId, userId: member.userId }).onConflictDoNothing();
      } else {
        await tx.delete(taskStars).where(and(eq(taskStars.userId, member.userId), eq(taskStars.taskId, taskId)));
      }
      await this.audit.write(tx, { action: starred ? 'task.star' : 'task.unstar', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId });
    });
  }

  /* ================================================================== subtasks */

  async addSubtask(member: MembershipContext, taskId: string, body: CreateSubtaskBody): Promise<SubtaskView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.peekTask(tx, member, taskId);
      assertAction(access.actions, 'edit');
      if (body.assigneeId) {
        assertAction(access.actions, 'assign');
        await this.access.assertCanView(tx, member.workspaceId, access.project.id, access.project.visibility, [body.assigneeId]);
      }
      const [last] = await tx.select({ position: subtasks.position }).from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(desc(subtasks.position)).limit(1);
      const [row] = await tx
        .insert(subtasks)
        .values({ workspaceId: member.workspaceId, taskId, title: body.title.trim(), assigneeId: body.assigneeId ?? null, position: keyBetween(last?.position ?? null, null) })
        .returning();
      if (!row) throw new Error('subtask insert returned nothing');
      await this.event(tx, member, taskId, 'subtask.added', { subtaskId: row.id, title: row.title });
      await this.audit.write(tx, { action: 'task.subtask.create', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { after: { subtaskId: row.id, title: row.title } } });
      await this.subtasksChanged(tx, member, task);
      return subtaskView(row);
    });
  }

  async updateSubtask(member: MembershipContext, taskId: string, subtaskId: string, body: UpdateSubtaskBody): Promise<SubtaskView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.peekTask(tx, member, taskId);
      assertAction(access.actions, 'edit');
      if (body.assigneeId !== undefined) {
        assertAction(access.actions, 'assign');
        if (body.assigneeId) await this.access.assertCanView(tx, member.workspaceId, access.project.id, access.project.visibility, [body.assigneeId]);
      }
      const [row] = await tx
        .update(subtasks)
        .set({
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.done !== undefined ? { done: body.done, completedAt: body.done ? sql`coalesce(${subtasks.completedAt}, now())` : null } : {}),
          ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId } : {}),
        })
        .where(and(eq(subtasks.workspaceId, member.workspaceId), eq(subtasks.taskId, taskId), eq(subtasks.id, subtaskId)))
        .returning();
      if (!row) throw ApiError.notFound('The subtask');
      if (body.done !== undefined) await this.event(tx, member, taskId, body.done ? 'subtask.completed' : 'subtask.reopened', { subtaskId, title: row.title });
      await this.audit.write(tx, { action: 'task.subtask.update', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { subtaskId, after: body } });
      await this.subtasksChanged(tx, member, task);
      return subtaskView(row);
    });
  }

  async removeSubtask(member: MembershipContext, taskId: string, subtaskId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.peekTask(tx, member, taskId);
      assertAction(access.actions, 'edit');
      const deleted = await tx
        .delete(subtasks)
        .where(and(eq(subtasks.workspaceId, member.workspaceId), eq(subtasks.taskId, taskId), eq(subtasks.id, subtaskId)))
        .returning({ title: subtasks.title });
      if (deleted.length === 0) throw ApiError.notFound('The subtask');
      await this.audit.write(tx, { action: 'task.subtask.delete', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { subtaskId, before: deleted[0] } });
      await this.subtasksChanged(tx, member, task);
    });
  }

  /**
   * Reorders a subtask the way the board orders cards: the new key lies between the named
   * neighbours. Names that are not (or no longer) siblings, or that are not next to each other,
   * mean the client's list is stale: 409 SUBTASKS_CHANGED. The task's subtasks are locked for the
   * change, so two reorders of one list queue instead of interleaving; keys that grew too long are
   * rewritten for the whole list.
   */
  async moveSubtask(member: MembershipContext, taskId: string, subtaskId: string, body: MoveSubtaskBody): Promise<SubtaskView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.peekTask(tx, member, taskId);
      assertAction(access.actions, 'edit');
      const siblings = await tx
        .select({ id: subtasks.id, position: subtasks.position })
        .from(subtasks)
        .where(and(eq(subtasks.workspaceId, member.workspaceId), eq(subtasks.taskId, taskId)))
        .orderBy(asc(subtasks.position), asc(subtasks.id))
        .for('update');
      if (!siblings.some((entry) => entry.id === subtaskId)) throw ApiError.notFound('The subtask');
      const others = siblings.filter((entry) => entry.id !== subtaskId);
      const indexOf = (id: string | null | undefined): number | null => {
        if (!id) return null;
        const index = others.findIndex((entry) => entry.id === id);
        if (index === -1) throw new ApiError('SUBTASKS_CHANGED', 'A neighbouring subtask is gone; reload the task.');
        return index;
      };
      const after = indexOf(body.afterId);
      const before = indexOf(body.beforeId);
      if (after !== null && before !== null && before !== after + 1) throw new ApiError('SUBTASKS_CHANGED', 'The named subtasks are no longer next to each other.');
      // The slot in the list without the moving subtask: after `after`, before `before`, or the end.
      const slot = after !== null ? after + 1 : before !== null ? before : others.length;
      const previous = others[slot - 1]?.position ?? null;
      const next = others[slot]?.position ?? null;

      let position: string | null = null;
      if (previous === null || next === null || previous < next) {
        try {
          position = keyBetween(previous, next);
        } catch {
          position = null;
        }
      }
      if (position === null || position.length > REBALANCE_KEY_LENGTH) {
        const order = [...others.slice(0, slot).map((entry) => entry.id), subtaskId, ...others.slice(slot).map((entry) => entry.id)];
        const keys = keysBetween(null, null, order.length);
        await tx.execute(sql`
          update subtasks s set position = m.position
          from unnest(${sql.param(order)}::uuid[], ${sql.param(keys)}::text[]) as m(id, position)
          where s.workspace_id = ${member.workspaceId} and s.task_id = ${taskId} and s.id = m.id`);
        position = keys[slot] ?? '';
      } else {
        await tx.update(subtasks).set({ position }).where(and(eq(subtasks.workspaceId, member.workspaceId), eq(subtasks.id, subtaskId)));
      }
      const [row] = await tx.select().from(subtasks).where(and(eq(subtasks.workspaceId, member.workspaceId), eq(subtasks.id, subtaskId)));
      if (!row) throw ApiError.notFound('The subtask');
      await this.audit.write(tx, { action: 'task.subtask.move', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { subtaskId, after: { position, index: slot } } });
      await this.subtasksChanged(tx, member, task);
      return subtaskView(row);
    });
  }

  /**
   * Tells the task's viewers its checklist changed. Subtasks do not bump the task's version (a
   * checkbox must not make a concurrent title edit stale), so clients refetch on `subtasks`.
   */
  private async subtasksChanged(tx: Tx, member: MembershipContext, task: TaskRow): Promise<void> {
    await this.outbox.add(tx, {
      type: 'task.updated',
      aggregateType: 'task',
      aggregateId: task.id,
      workspaceId: member.workspaceId,
      payload: { taskId: task.id, projectId: task.projectId, version: task.version, fields: ['subtasks'] },
    });
  }

  /* ================================================================== comments */

  async addComment(member: MembershipContext, taskId: string, body: CreateCommentBody): Promise<TaskCommentView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.peekTask(tx, member, taskId);
      assertAction(access.actions, 'create', 'Commenting needs the create permission in this project.');
      let replyToAuthorId: string | null = null;
      if (body.replyToId) {
        const [parent] = await tx
          .select({ authorId: taskComments.authorId })
          .from(taskComments)
          .where(and(eq(taskComments.workspaceId, member.workspaceId), eq(taskComments.taskId, taskId), eq(taskComments.id, body.replyToId), isNull(taskComments.deletedAt)));
        if (!parent) throw ApiError.validation([{ field: 'replyToId', message: 'not a comment of this task' }]);
        replyToAuthorId = parent.authorId;
      }
      const [row] = await tx
        .insert(taskComments)
        .values({ workspaceId: member.workspaceId, taskId, authorId: member.userId, body: body.body.trim(), replyToId: body.replyToId ?? null })
        .returning();
      if (!row) throw new Error('comment insert returned nothing');
      await this.event(tx, member, taskId, 'commented', { commentId: row.id });
      await this.audit.write(tx, { action: 'task.comment.create', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { commentId: row.id } });
      await this.outbox.add(tx, {
        type: 'task.commented',
        aggregateType: 'task',
        aggregateId: taskId,
        workspaceId: member.workspaceId,
        payload: {
          ...(await this.feedPayload(tx, task, access.project)),
          commentId: row.id,
          excerpt: row.body.slice(0, EXCERPT),
          replyToAuthorId,
        },
      });
      return commentView(row);
    });
  }

  /** Authors edit their own comments. */
  async updateComment(member: MembershipContext, taskId: string, commentId: string, text: string): Promise<TaskCommentView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      await this.peekTask(tx, member, taskId);
      const [row] = await tx
        .update(taskComments)
        .set({ body: text.trim(), editedAt: sql`now()` })
        .where(
          and(
            eq(taskComments.workspaceId, member.workspaceId),
            eq(taskComments.taskId, taskId),
            eq(taskComments.id, commentId),
            eq(taskComments.authorId, member.userId),
            isNull(taskComments.deletedAt),
          ),
        )
        .returning();
      if (!row) throw ApiError.notFound('Your comment');
      await this.audit.write(tx, { action: 'task.comment.update', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { commentId } });
      return commentView(row);
    });
  }

  /** Authors delete their own comments; the project's `delete` permission deletes anyone's. */
  async removeComment(member: MembershipContext, taskId: string, commentId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const { access } = await this.peekTask(tx, member, taskId);
      const [comment] = await tx
        .select({ authorId: taskComments.authorId })
        .from(taskComments)
        .where(and(eq(taskComments.workspaceId, member.workspaceId), eq(taskComments.taskId, taskId), eq(taskComments.id, commentId), isNull(taskComments.deletedAt)));
      if (!comment) throw ApiError.notFound('The comment');
      if (comment.authorId !== member.userId) assertAction(access.actions, 'delete');
      await tx.update(taskComments).set({ deletedAt: sql`now()` }).where(and(eq(taskComments.workspaceId, member.workspaceId), eq(taskComments.id, commentId)));
      await this.audit.write(tx, { action: 'task.comment.delete', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { commentId, authorId: comment.authorId } });
    });
  }

  /* ================================================================== files */

  async attach(member: MembershipContext, taskId: string, attachmentId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const { task, access } = await this.peekTask(tx, member, taskId);
      assertAction(access.actions, 'edit');
      const fileName = await this.linkFile(tx, member, taskId, attachmentId);
      await this.event(tx, member, taskId, 'file.attached', { attachmentId, fileName });
      await this.audit.write(tx, { action: 'task.attachment.add', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { attachmentId } });
      await this.outbox.add(tx, {
        type: 'task.file_attached',
        aggregateType: 'task',
        aggregateId: taskId,
        workspaceId: member.workspaceId,
        payload: { ...(await this.feedPayload(tx, task, access.project)), attachmentId, fileName },
      });
    });
  }

  async detach(member: MembershipContext, taskId: string, attachmentId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const { access } = await this.peekTask(tx, member, taskId);
      assertAction(access.actions, 'edit');
      const deleted = await tx
        .delete(taskAttachments)
        .where(and(eq(taskAttachments.workspaceId, member.workspaceId), eq(taskAttachments.taskId, taskId), eq(taskAttachments.attachmentId, attachmentId)))
        .returning({ id: taskAttachments.attachmentId });
      if (deleted.length === 0) throw ApiError.notFound('The attachment');
      await this.audit.write(tx, { action: 'task.attachment.remove', workspaceId: member.workspaceId, resourceType: 'task', resourceId: taskId, changes: { attachmentId } });
    });
  }

  /* ================================================================== helpers */

  private scope(member: MembershipContext) {
    return { workspaceId: member.workspaceId, userId: member.userId };
  }

  private async card(tx: Tx, member: MembershipContext, taskId: string): Promise<TaskCard> {
    const [row] = (await tx.execute<CardRow>(cardQuery(member, taskId))).rows;
    if (!row) throw ApiError.notFound('The task');
    return toCard(row);
  }

  /** The task (unlocked) and the caller's access to its project; 404 when either is invisible. */
  private async peekTask(tx: Tx, member: MembershipContext, taskId: string): Promise<{ task: TaskRow; access: ProjectAccess }> {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.id, taskId), isNull(tasks.deletedAt)));
    if (!task) throw ApiError.notFound('The task');
    try {
      return { task, access: await this.access.project(tx, member, task.projectId) };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') throw ApiError.notFound('The task');
      throw error;
    }
  }

  /** Locks the task row for this transaction (after any column lock), re-reading it. */
  private async lockTask(tx: Tx, member: MembershipContext, taskId: string): Promise<{ task: TaskRow; access: ProjectAccess }> {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.id, taskId), isNull(tasks.deletedAt)))
      .for('update');
    if (!task) throw ApiError.notFound('The task');
    try {
      return { task, access: await this.access.project(tx, member, task.projectId) };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') throw ApiError.notFound('The task');
      throw error;
    }
  }

  /** Locks a live column of the project's workflow; anything else is 409 COLUMN_GONE. */
  private async lockColumn(tx: Tx, member: MembershipContext, project: ProjectRow, columnId: string): Promise<ColumnRow> {
    const [column] = await tx
      .select()
      .from(boardColumns)
      .where(and(eq(boardColumns.workspaceId, member.workspaceId), eq(boardColumns.id, columnId)))
      .for('update');
    if (!column || column.deletedAt || column.workflowId !== project.workflowId) throw new ApiError('COLUMN_GONE');
    return column;
  }

  /** The explicit column, or the first live column with `status`; locked for ordering. */
  private async resolveColumn(tx: Tx, member: MembershipContext, project: ProjectRow, columnId: string | null, status: TaskStatus): Promise<ColumnRow> {
    if (columnId) return this.lockColumn(tx, member, project, columnId);
    const columns = await this.board.liveColumns(tx, project.workflowId);
    const column = columns.find((entry) => entry.status === status) ?? columns.find((entry) => entry.status === 'todo');
    if (!column) throw new ApiError('WORKFLOW_CATEGORY_REQUIRED');
    return this.lockColumn(tx, member, project, column.id);
  }

  private async firstIn(tx: Tx, member: MembershipContext, columnId: string, except: string): Promise<string | null> {
    const [first] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.columnId, columnId), ne(tasks.id, except), isNull(tasks.deletedAt), isNull(tasks.archivedAt)))
      .orderBy(asc(tasks.position), asc(tasks.id))
      .limit(1);
    return first?.id ?? null;
  }

  /**
   * The key between the named neighbours (both must be live cards of the column, or the client's
   * board is stale: 409 BOARD_CHANGED). With one neighbour the other side is its current
   * neighbour; with none the card goes to the end.
   */
  private async positionIn(tx: Tx, member: MembershipContext, columnId: string, taskId: string, afterId: string | null, beforeId: string | null): Promise<string> {
    const live = and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.columnId, columnId), ne(tasks.id, taskId), isNull(tasks.deletedAt), isNull(tasks.archivedAt));
    const neighbour = async (id: string) => {
      const [row] = await tx.select({ position: tasks.position }).from(tasks).where(and(live, eq(tasks.id, id)));
      if (!row) throw new ApiError('BOARD_CHANGED', 'A neighbouring card moved; reload the board.');
      return row.position;
    };
    const after = afterId ? await neighbour(afterId) : null;
    const before = beforeId ? await neighbour(beforeId) : null;
    if (after !== null && before !== null) return keyBetween(after, before);
    if (after !== null) {
      const [next] = await tx.select({ position: tasks.position }).from(tasks).where(and(live, gt(tasks.position, after))).orderBy(asc(tasks.position)).limit(1);
      return keyBetween(after, next?.position ?? null);
    }
    if (before !== null) {
      const [previous] = await tx.select({ position: tasks.position }).from(tasks).where(and(live, lt(tasks.position, before))).orderBy(desc(tasks.position)).limit(1);
      return keyBetween(previous?.position ?? null, before);
    }
    const [last] = await tx.select({ position: tasks.position }).from(tasks).where(live).orderBy(desc(tasks.position)).limit(1);
    return keyBetween(last?.position ?? null, null);
  }

  /** Writes the new column and position; the trigger sets the status, this sets the done bookkeeping. */
  private async place(tx: Tx, member: MembershipContext, task: TaskRow, column: ColumnRow, position: string): Promise<void> {
    const toDone = column.status === 'done';
    const wasDone = task.status === 'done';
    await tx
      .update(tasks)
      .set({
        columnId: column.id,
        position,
        version: sql`${tasks.version} + 1`,
        ...(toDone && !wasDone ? { completedAt: sql`now()`, reopenColumnId: task.columnId } : {}),
        ...(!toDone && wasDone ? { completedAt: null, reopenColumnId: null } : {}),
      })
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.id, task.id)));
  }

  /** Rewrites a column's keys evenly (keys grew past the limit); returns the moved card's new key. */
  private async rebalance(tx: Tx, member: MembershipContext, columnId: string, taskId: string): Promise<string> {
    const cards = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.columnId, columnId), isNull(tasks.deletedAt), isNull(tasks.archivedAt)))
      .orderBy(asc(tasks.position), asc(tasks.id));
    const keys = keysBetween(null, null, cards.length);
    await tx.execute(sql`
      update tasks t set position = m.position
      from unnest(${sql.param(cards.map((card) => card.id))}::uuid[], ${sql.param(keys)}::text[]) as m(id, position)
      where t.workspace_id = ${member.workspaceId} and t.id = m.id`);
    return keys[cards.findIndex((card) => card.id === taskId)] ?? '';
  }

  private async afterPlacement(
    tx: Tx,
    member: MembershipContext,
    task: TaskRow,
    project: ProjectRow,
    column: ColumnRow,
    position: string,
    kind: 'moved' | 'completed' | 'reopened',
  ): Promise<void> {
    const version = task.version + 1;
    await this.event(tx, member, task.id, kind, { from: task.columnId, to: column.id });
    await this.audit.write(tx, {
      action: kind === 'moved' ? 'task.move' : kind === 'completed' ? 'task.complete' : 'task.reopen',
      workspaceId: member.workspaceId,
      resourceType: 'task',
      resourceId: task.id,
      changes: { before: { columnId: task.columnId, status: task.status }, after: { columnId: column.id, status: column.status } },
    });
    await this.outbox.add(tx, {
      type: 'task.moved',
      aggregateType: 'task',
      aggregateId: task.id,
      workspaceId: member.workspaceId,
      payload: { taskId: task.id, projectId: task.projectId, fromColumnId: task.columnId, toColumnId: column.id, position, version },
    });
    if (column.status !== task.status) {
      await this.outbox.add(tx, {
        type: 'task.status_changed',
        aggregateType: 'task',
        aggregateId: task.id,
        workspaceId: member.workspaceId,
        payload: { ...(await this.feedPayload(tx, task, project)), from: task.status, to: column.status },
      });
    }
  }

  /** The people a task's feed events concern: assignees, reviewer and creator. */
  private async feedPayload(tx: Tx, task: TaskRow, project: ProjectRow) {
    const assignees = (await tx.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, task.id))).map((row) => row.userId);
    const watcherIds = [...new Set([...assignees, task.createdBy, ...(task.reviewerId ? [task.reviewerId] : [])])];
    return { taskId: task.id, projectId: project.id, code: `${project.key}-${task.number}`, title: task.title, watcherIds };
  }

  private async setLabels(tx: Tx, member: MembershipContext, taskId: string, labelIds: readonly string[]): Promise<void> {
    const wanted = [...new Set(labelIds)];
    if (wanted.length > 0) {
      const found = await tx.select({ id: labels.id }).from(labels).where(and(eq(labels.workspaceId, member.workspaceId), inArray(labels.id, wanted)));
      if (found.length !== wanted.length) throw ApiError.validation([{ field: 'labelIds', message: 'unknown label' }]);
    }
    await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
    if (wanted.length > 0) await tx.insert(taskLabels).values(wanted.map((labelId) => ({ workspaceId: member.workspaceId, taskId, labelId })));
  }

  /**
   * Links a file the caller uploaded (no one attaches someone else's upload by guessing its id).
   * Returns its name.
   */
  private async linkFile(tx: Tx, member: MembershipContext, taskId: string, attachmentId: string): Promise<string> {
    const [file] = await tx
      .select({ id: attachments.id, status: attachments.status, uploaderId: attachments.uploaderId, fileName: attachments.fileName })
      .from(attachments)
      .where(and(eq(attachments.workspaceId, member.workspaceId), eq(attachments.id, attachmentId), isNull(attachments.deletedAt)));
    if (!file || file.uploaderId !== member.userId || !['scanning', 'ready'].includes(file.status)) {
      throw ApiError.validation([{ field: 'attachmentId', message: 'not a completed upload of yours' }]);
    }
    try {
      await tx.insert(taskAttachments).values({ workspaceId: member.workspaceId, taskId, attachmentId, addedBy: member.userId }).onConflictDoNothing();
    } catch (error) {
      if (pgError(error)?.code === PG.foreignKeyViolation) throw ApiError.validation([{ field: 'attachmentId', message: 'unknown file' }]);
      throw error;
    }
    return file.fileName;
  }

  /** Links a file of the task's source message (already checked to be that message's). */
  private async linkSourceFile(tx: Tx, member: MembershipContext, taskId: string, attachmentId: string): Promise<void> {
    const [file] = await tx
      .select({ status: attachments.status })
      .from(attachments)
      .where(and(eq(attachments.workspaceId, member.workspaceId), eq(attachments.id, attachmentId), isNull(attachments.deletedAt)));
    if (!file || !['scanning', 'ready'].includes(file.status)) throw ApiError.validation([{ field: 'attachmentIds', message: 'the file is not available' }]);
    await tx.insert(taskAttachments).values({ workspaceId: member.workspaceId, taskId, attachmentId, addedBy: member.userId }).onConflictDoNothing();
  }

  private async event(tx: Tx, member: MembershipContext, taskId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    await tx.insert(taskEvents).values({ workspaceId: member.workspaceId, taskId, actorId: member.userId, type, payload });
  }

  /** Today in the workspace's time zone. */
  private async today(tx: Tx, workspaceId: string): Promise<string> {
    const [workspace] = await tx.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId));
    return dateIn(workspace?.settings.timeZone ?? 'Asia/Tehran', this.clock.now());
  }
}

/* ------------------------------------------------------------------ mapping */

export function subtaskView(row: typeof subtasks.$inferSelect): SubtaskView {
  return { id: row.id, title: row.title, done: row.done, assigneeId: row.assigneeId, position: row.position };
}

export function commentView(row: typeof taskComments.$inferSelect): TaskCommentView {
  return { id: row.id, authorId: row.authorId, body: row.body, replyToId: row.replyToId, createdAt: row.createdAt.toISOString(), editedAt: row.editedAt?.toISOString() ?? null };
}

export function toDetail(row: DetailRow, actions: readonly PermissionActionId[], member: MembershipContext): TaskDetail {
  return {
    ...toCard(row),
    description: row.description,
    createdById: row.created_by,
    reopenColumnId: row.reopen_column_id,
    subtasks: row.subtasks ?? [],
    comments: (row.comments ?? []).map((comment) => ({ ...comment, createdAt: iso(comment.createdAt), editedAt: isoOrNull(comment.editedAt) })),
    attachments: (row.attachments ?? []).map((file) => ({ ...file, size: Number(file.size), uploadedAt: iso(file.uploadedAt) })),
    timeline: (row.timeline ?? []).map((entry) => ({ ...entry, createdAt: iso(entry.createdAt) })),
    myActions: actions,
    sourceMessage: sourceMessageView(row.source_message, member),
  };
}

/**
 * Anyone who sees the task learns it came from a message; where and what only reaches people who
 * can read that conversation (its members, or anyone for a public channel they may browse).
 */
export function sourceMessageView(row: SourceMessageRow | null, member: MembershipContext): TaskSourceMessage | null {
  if (!row) return null;
  const readable =
    messageGrant(member, 'view') && (row.isMember || (row.conversationKind === 'channel' && !row.isPrivate && publicChannelVisible(member)));
  if (!readable) {
    return { messageId: row.messageId, accessible: false, conversationId: null, authorId: null, excerpt: null, kind: null, sentAt: null, deleted: row.deleted };
  }
  return {
    messageId: row.messageId,
    accessible: true,
    conversationId: row.conversationId,
    authorId: row.authorId,
    excerpt: row.deleted ? null : row.text,
    kind: row.kind,
    sentAt: iso(row.sentAt),
    deleted: row.deleted,
  };
}

