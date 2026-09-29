import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type {
  ConvertNoteBody,
  ConvertNoteResult,
  CreateNoteBody,
  CreateNoteCategoryBody,
  NoteCategoryView,
  NotePage,
  NoteView,
  TagTone,
  UpdateNoteBody,
  UpdateNoteCategoryBody,
} from '@taskin/contracts';
import { normaliseForSearch, splitForTask } from '@taskin/text';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { isUniqueViolation, PG, pgError } from '../../platform/db/pg-errors.js';
import { iso, num } from '../../platform/db/rows.js';
import { noteCategories, notes, tasks } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { decodeCursor, encodeCursor, searchPattern } from '../work/task-queries.js';
import { TasksService } from '../work/tasks.service.js';

/** The four notebooks every member starts with (the web app's `BUILT_IN_NOTE_CATEGORIES`). */
export const BUILT_IN_NOTE_CATEGORIES: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'personal', label: 'شخصی' },
  { key: 'work', label: 'کاری' },
  { key: 'ideas', label: 'ایده‌ها' },
  { key: 'meetings', label: 'صورت‌جلسه‌ها' },
];

type NoteRow = typeof notes.$inferSelect;

interface NoteListRow extends Record<string, unknown> {
  id: string;
  category_id: string;
  title: string;
  body: string;
  colors: TagTone[] | string;
  pinned_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  linked_task_id: string | null;
  sort_updated: string;
}

/** Postgres returns enum arrays as their text form (`{red,blue}`) through raw queries. */
function toneArray(value: TagTone[] | string): TagTone[] {
  if (Array.isArray(value)) return value;
  return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean) as TagTone[];
}

function noteView(row: NoteRow, linkedTaskId: string | null): NoteView {
  return {
    id: row.id,
    categoryId: row.categoryId,
    title: row.title,
    body: row.body,
    colors: row.colors,
    pinned: row.pinnedAt !== null,
    linkedTaskId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Private notes (RFC §8): row-level security admits only their owner, so every query here is
 * automatically "mine". Autosave uses `If-Match`; converting a note to a task happens in the same
 * transaction as creating the task, and a note converts at most once while its task lives.
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly tasks: TasksService,
  ) {}

  /* ------------------------------------------------------------------ categories */

  async categories(member: MembershipContext): Promise<NoteCategoryView[]> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      await this.ensureBuiltIns(tx, member);
      const result = await tx.execute<{ id: string; key: string | null; label: string; is_builtin: boolean; position: number; note_count: string }>(sql`
        select c.id, c.key, c.label, c.is_builtin, c.position,
          (select count(*) from notes n where n.workspace_id = c.workspace_id and n.category_id = c.id) as note_count
        from note_categories c
        where c.workspace_id = ${member.workspaceId} and c.owner_id = ${member.userId} and c.deleted_at is null
        order by c.is_builtin desc, c.position, c.created_at, c.id`);
      return result.rows.map((row) => ({ id: row.id, key: row.key, label: row.label, builtIn: row.is_builtin, position: row.position, noteCount: num(row.note_count) }));
    });
  }

  async createCategory(member: MembershipContext, body: CreateNoteCategoryBody): Promise<NoteCategoryView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      await this.ensureBuiltIns(tx, member);
      try {
        const [row] = await tx
          .insert(noteCategories)
          .values({ workspaceId: member.workspaceId, ownerId: member.userId, label: body.label.trim(), position: sql`(select coalesce(max(position), 0) + 1 from note_categories where workspace_id = ${member.workspaceId} and owner_id = ${member.userId})` })
          .returning();
        if (!row) throw new Error('category insert returned nothing');
        await this.audit.write(tx, { action: 'note.category.create', workspaceId: member.workspaceId, resourceType: 'note_category', resourceId: row.id });
        return { id: row.id, key: row.key, label: row.label, builtIn: false, position: row.position, noteCount: 0 };
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError('CONFLICT', 'You already have a category with that name.');
        throw error;
      }
    });
  }

  /** Custom categories only: the built-ins keep their names. */
  async updateCategory(member: MembershipContext, categoryId: string, body: UpdateNoteCategoryBody): Promise<NoteCategoryView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const current = await this.category(tx, member, categoryId);
      if (current.isBuiltin && body.label !== undefined) throw new ApiError('CONFLICT', 'Built-in categories cannot be renamed.');
      try {
        const [row] = await tx
          .update(noteCategories)
          .set({ ...(body.label !== undefined ? { label: body.label.trim() } : {}), ...(body.position !== undefined ? { position: body.position } : {}) })
          .where(and(eq(noteCategories.workspaceId, member.workspaceId), eq(noteCategories.id, categoryId)))
          .returning();
        if (!row) throw ApiError.notFound('The category');
        const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(notes).where(and(eq(notes.workspaceId, member.workspaceId), eq(notes.categoryId, categoryId)));
        await this.audit.write(tx, { action: 'note.category.update', workspaceId: member.workspaceId, resourceType: 'note_category', resourceId: categoryId, changes: { after: body } });
        return { id: row.id, key: row.key, label: row.label, builtIn: row.isBuiltin, position: row.position, noteCount: count?.n ?? 0 };
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError('CONFLICT', 'You already have a category with that name.');
        throw error;
      }
    });
  }

  /**
   * Any notebook can go, built-ins included. Its notes are kept, filed in no notebook
   * (`category_id` null, a new version each). A built-in stays as a tombstone, so seeding the
   * built-ins never brings it back; a custom notebook is removed outright.
   */
  async removeCategory(member: MembershipContext, categoryId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const current = await this.category(tx, member, categoryId);
      const released = await tx
        .update(notes)
        .set({ categoryId: null, version: sql`${notes.version} + 1` })
        .where(and(eq(notes.workspaceId, member.workspaceId), eq(notes.ownerId, member.userId), eq(notes.categoryId, categoryId)))
        .returning({ id: notes.id });
      const where = and(eq(noteCategories.workspaceId, member.workspaceId), eq(noteCategories.id, categoryId));
      try {
        if (current.isBuiltin) await tx.update(noteCategories).set({ deletedAt: sql`now()` }).where(where);
        else await tx.delete(noteCategories).where(where);
      } catch (error) {
        const code = pgError(error)?.code;
        if (code === PG.foreignKeyViolation || code === PG.restrictViolation) throw new ApiError('NOTE_CATEGORY_IN_USE');
        throw error;
      }
      await this.audit.write(tx, {
        action: 'note.category.delete',
        workspaceId: member.workspaceId,
        resourceType: 'note_category',
        resourceId: categoryId,
        changes: { before: { label: current.label, builtIn: current.isBuiltin }, uncategorisedNotes: released.length },
      });
    });
  }

  /* ------------------------------------------------------------------ notes */

  async list(member: MembershipContext, query: { categoryId?: string; q?: string; cursor?: string; limit: number }): Promise<NotePage> {
    const conditions = [sql`n.workspace_id = ${member.workspaceId}`, sql`n.owner_id = ${member.userId}`];
    if (query.categoryId) conditions.push(sql`n.category_id = ${query.categoryId}`);
    const pattern = query.q ? searchPattern(query.q) : null;
    // The trigram index, through app.search_note_ids (row-level security keeps LIKE out of index conditions).
    if (pattern) conditions.push(sql`n.id = any(array(select app.search_note_ids(${pattern})))`);
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      conditions.push(sql`(n.updated_at, n.id) < (${cursor.value}::timestamptz, ${cursor.id}::uuid)`);
    }
    const result = await this.uow.run(this.scope(member), ({ tx }) =>
      tx.execute<NoteListRow>(sql`
        select n.id, n.category_id, n.title, n.body, n.colors, n.pinned_at, n.version, n.created_at, n.updated_at,
          n.updated_at::text as sort_updated,
          (select t.id from tasks t where t.workspace_id = n.workspace_id and t.source_note_id = n.id and t.deleted_at is null limit 1) as linked_task_id
        from notes n
        where ${sql.join(conditions, sql` and `)}
        order by n.updated_at desc, n.id desc
        limit ${query.limit + 1}`),
    );
    const rows = result.rows;
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items: rows.slice(0, query.limit).map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        title: row.title,
        body: row.body,
        colors: toneArray(row.colors),
        pinned: row.pinned_at !== null,
        linkedTaskId: row.linked_task_id,
        version: row.version,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      })),
      nextCursor: last ? encodeCursor(last.sort_updated, last.id) : null,
    };
  }

  async get(member: MembershipContext, noteId: string): Promise<NoteView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const row = await this.note(tx, member, noteId);
      return noteView(row, await this.linkedTask(tx, member, noteId));
    });
  }

  async create(member: MembershipContext, body: CreateNoteBody): Promise<NoteView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      await this.ensureBuiltIns(tx, member);
      // Unsaid: «شخصی» while it exists. `null`, or no «شخصی» left: filed in no notebook.
      const categoryId = body.categoryId === undefined ? await this.builtIn(tx, member, 'personal') : body.categoryId;
      if (categoryId !== null) await this.category(tx, member, categoryId);
      const title = body.title?.trim() ?? '';
      const text = body.body ?? '';
      const [row] = await tx
        .insert(notes)
        .values({
          workspaceId: member.workspaceId,
          ownerId: member.userId,
          categoryId,
          title,
          body: text,
          colors: [...new Set(body.colors ?? [])],
          pinnedAt: body.pinned ? sql`now()` : null,
          searchText: normaliseForSearch(`${title} ${text}`),
        })
        .returning();
      if (!row) throw new Error('note insert returned nothing');
      await this.audit.write(tx, { action: 'note.create', workspaceId: member.workspaceId, resourceType: 'note', resourceId: row.id });
      return noteView(row, null);
    });
  }

  /** Autosave: the client sends the version it edited; a newer one on the server is 412. */
  async update(member: MembershipContext, noteId: string, ifMatch: number, body: UpdateNoteBody): Promise<NoteView> {
    return this.uow.run(this.scope(member), async ({ tx }) => {
      const current = await this.note(tx, member, noteId, true);
      if (current.version !== ifMatch) throw ApiError.stale(noteView(current, await this.linkedTask(tx, member, noteId)));
      if (body.categoryId !== undefined && body.categoryId !== null) await this.category(tx, member, body.categoryId);
      const title = body.title?.trim() ?? current.title;
      const text = body.body ?? current.body;
      const [row] = await tx
        .update(notes)
        .set({
          title,
          body: text,
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.colors !== undefined ? { colors: [...new Set(body.colors)] } : {}),
          ...(body.pinned !== undefined ? { pinnedAt: body.pinned ? (current.pinnedAt ?? sql`now()`) : null } : {}),
          searchText: normaliseForSearch(`${title} ${text}`),
          version: sql`${notes.version} + 1`,
        })
        .where(and(eq(notes.workspaceId, member.workspaceId), eq(notes.id, noteId)))
        .returning();
      if (!row) throw ApiError.notFound('The note');
      await this.audit.write(tx, {
        action: 'note.update',
        workspaceId: member.workspaceId,
        resourceType: 'note',
        resourceId: noteId,
        changes: { fields: Object.keys(body).filter((key) => body[key as keyof UpdateNoteBody] !== undefined) },
      });
      return noteView(row, await this.linkedTask(tx, member, noteId));
    });
  }

  /** Deleted for good; a task made from it keeps its content and loses the link. */
  async remove(member: MembershipContext, noteId: string): Promise<void> {
    await this.uow.run(this.scope(member), async ({ tx }) => {
      const deleted = await tx.delete(notes).where(and(eq(notes.workspaceId, member.workspaceId), eq(notes.id, noteId))).returning({ id: notes.id });
      if (deleted.length === 0) throw ApiError.notFound('The note');
      await this.audit.write(tx, { action: 'note.delete', workspaceId: member.workspaceId, resourceType: 'note', resourceId: noteId });
    });
  }

  /**
   * "تبدیل یادداشت به وظیفه" (RFC §10.2): the title becomes the task's, the prose its description
   * and the open checklist items its subtasks. The note row is locked first, so two devices
   * converting at once get one task: the second sees it and answers `existing: true`.
   */
  async convert(member: MembershipContext, noteId: string, body: ConvertNoteBody): Promise<ConvertNoteResult> {
    const result = await this.uow.run(this.scope(member), async (unit) => {
      const note = await this.note(unit.tx, member, noteId, true);
      const existing = await this.linkedTask(unit.tx, member, noteId);
      if (existing) return { taskId: existing, existing: true };
      const { description, subtasks } = splitForTask(note.body);
      const title = (note.title.trim() || description.split('\n').find((line) => line.trim())?.trim() || 'یادداشت').slice(0, 200);
      const taskId = await this.tasks.createIn(
        unit,
        member,
        {
          projectId: body.projectId,
          title,
          description,
          columnId: body.columnId ?? null,
          priority: body.priority,
          assigneeIds: body.assigneeIds,
          dueDate: body.dueDate ?? null,
          subtasks,
        },
        { sourceNoteId: noteId },
      );
      await this.audit.write(unit.tx, { action: 'note.convert', workspaceId: member.workspaceId, resourceType: 'note', resourceId: noteId, changes: { taskId } });
      await this.outbox.add(unit.tx, {
        type: 'note.task_linked',
        aggregateType: 'note',
        aggregateId: noteId,
        workspaceId: member.workspaceId,
        payload: { noteId, taskId, ownerId: member.userId },
      });
      return { taskId, existing: false };
    });
    return { task: await this.tasks.detail(member, result.taskId), existing: result.existing };
  }

  /* ------------------------------------------------------------------ helpers */

  private scope(member: MembershipContext) {
    return { workspaceId: member.workspaceId, userId: member.userId };
  }

  private async ensureBuiltIns(tx: Tx, member: MembershipContext): Promise<void> {
    await tx.execute(sql`
      insert into note_categories (workspace_id, owner_id, key, label, is_builtin, position)
      select ${member.workspaceId}, ${member.userId}, b.key, b.label, true, b.position
      from jsonb_to_recordset(${JSON.stringify(BUILT_IN_NOTE_CATEGORIES.map((entry, position) => ({ ...entry, position })))}::jsonb)
        as b(key text, label text, position int)
      on conflict do nothing`);
  }

  /** A built-in notebook's id, or `null` once the member has deleted it. */
  private async builtIn(tx: Tx, member: MembershipContext, key: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: noteCategories.id })
      .from(noteCategories)
      .where(and(eq(noteCategories.workspaceId, member.workspaceId), eq(noteCategories.ownerId, member.userId), eq(noteCategories.key, key), isNull(noteCategories.deletedAt)));
    return row?.id ?? null;
  }

  private async category(tx: Tx, member: MembershipContext, categoryId: string): Promise<typeof noteCategories.$inferSelect> {
    const [row] = await tx
      .select()
      .from(noteCategories)
      .where(and(eq(noteCategories.workspaceId, member.workspaceId), eq(noteCategories.ownerId, member.userId), eq(noteCategories.id, categoryId), isNull(noteCategories.deletedAt)));
    if (!row) throw ApiError.validation([{ field: 'categoryId', message: 'unknown category' }]);
    return row;
  }

  private async note(tx: Tx, member: MembershipContext, noteId: string, lock = false): Promise<NoteRow> {
    const query = tx
      .select()
      .from(notes)
      .where(and(eq(notes.workspaceId, member.workspaceId), eq(notes.ownerId, member.userId), eq(notes.id, noteId)));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw ApiError.notFound('The note');
    return row;
  }

  private async linkedTask(tx: Tx, member: MembershipContext, noteId: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, member.workspaceId), eq(tasks.sourceNoteId, noteId), isNull(tasks.deletedAt)))
      .limit(1);
    return row?.id ?? null;
  }
}
