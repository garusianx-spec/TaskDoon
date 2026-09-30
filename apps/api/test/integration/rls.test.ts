import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CalendarService } from '../../src/modules/content/calendar.service.js';
import { bearer, createTestApp, idempotencyKey, invite, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createConversation, sendRest } from './chat-helpers.js';
import { createProject, createTask, expectStatus, wsPath } from './work-helpers.js';

/** Platform tables that carry a workspace id but are read across tenants by design. */
const CROSS_TENANT_BY_DESIGN = new Set([
  // The outbox relay publishes every tenant's events in id order; the API only ever inserts.
  'outbox_events',
]);

/** Private to their owner as well as their tenant: reads need the user setting too. */
const OWNER_SCOPED = new Set(['notes', 'note_categories', 'scheduled_messages']);

/** Gives a workspace at least one row in every tenant table, through the API where it can. */
async function populate(t: TestApp, owner: Session, workspaceId: string): Promise<void> {
  const base = wsPath(workspaceId);
  const project = await createProject(t, owner, workspaceId);
  const label = await t.http().post(`${base}/labels`).set(bearer(owner)).send({ name: `برچسب ${workspaceId.slice(0, 4)}` });
  const task = await createTask(t, owner, workspaceId, { projectId: project.id, assigneeIds: [owner.userId], labelIds: [label.body.id], subtasks: ['گام'] });
  expectStatus(await t.http().put(`${base}/tasks/${task.id}/star`).set(bearer(owner)), 204);
  expectStatus(await t.http().put(`${base}/projects/${project.id}/star`).set(bearer(owner)), 204);
  expectStatus(await t.http().post(`${base}/tasks/${task.id}/comments`).set(bearer(owner)).send({ body: 'نظر' }), 201);
  // A ready file of the owner's (the upload itself is covered by the files suite).
  const { rows } = await t.admin.query<{ id: string }>(
    `insert into attachments (workspace_id, uploader_id, bucket, object_key, file_name, mime_type, kind, size_bytes, status)
     values ($1::uuid, $2, 'taskin-files', 'ws/' || $1::text || '/att/' || gen_random_uuid(), 'a.pdf', 'application/pdf', 'document', 10, 'ready') returning id`,
    [workspaceId, owner.userId],
  );
  expectStatus(await t.http().post(`${base}/tasks/${task.id}/attachments`).set(bearer(owner)).send({ attachmentId: rows[0]?.id }), 204);
  const event = await t.http().post(`${base}/calendar/events`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ kind: 'meeting', title: 'جلسه', date: '2030-01-01', startTime: '09:00', attendeeIds: [owner.userId] });
  expectStatus(event, 201);
  expectStatus(await t.http().post(`${base}/notes`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ title: 'یادداشت' }), 201);
  // Chat: a conversation, a message mentioning its author, and a reaction.
  const group = await createConversation(t, owner, workspaceId, { kind: 'group', title: 'گفتگو', memberIds: [] });
  const sent = await sendRest(t, owner, workspaceId, group.id, { text: `<@${owner.userId}> سلام` });
  expectStatus(await t.http().put(`${base}/conversations/${group.id}/messages/${sent.id}/reactions/${encodeURIComponent('👍')}`).set(bearer(owner)), 200);
  // Phase 3.2: a scheduled message, working hours, and an auto-reply slot (written directly: it needs a second person).
  const later = new Date(Date.now() + 3600_000).toISOString();
  expectStatus(await t.http().post(`${base}/conversations/${group.id}/scheduled-messages`).set(bearer(owner)).send({ clientMsgId: randomUUID(), kind: 'text', text: 'بعداً', scheduledAt: later }), 201);
  expectStatus(await t.http().put(`${base}/me/working-hours`).set(bearer(owner)).send({ autoReplyEnabled: true, days: ['saturday'], start: '09:00', end: '17:00', message: 'بیرون از ساعت کاری' }), 200);
  await t.admin.query('insert into auto_reply_log (workspace_id, user_id, sender_id) values ($1, $2, $2)', [workspaceId, owner.userId]);
  // Activity (file-shared) and a notification (the reminder) come from the worker.
  await t.flushNotifications();
  await t.app.get(CalendarService).remind(workspaceId, event.body.id, event.body.version);
}

async function asApp<T>(pool: pg.Pool, settings: { workspaceId?: string; userId?: string }, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true)`, [
      settings.workspaceId ?? '',
      settings.userId ?? '',
    ]);
    const result = await work(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('M1 checklist: row-level security isolates tenants', () => {
  let t: TestApp;
  let a: { workspaceId: string; ownerId: string };
  let b: { workspaceId: string; roleId: string };
  let tenantTables: string[];

  beforeAll(async () => {
    t = await createTestApp();
    const first = await ownerWithWorkspace(t, 'فضای الف');
    const second = await ownerWithWorkspace(t, 'فضای ب');
    // Give both tenants rows in every tenant table: invitations and audit rows included.
    await invite(t, first.owner, first.workspace.id, ['mina@alef.test']);
    await invite(t, second.owner, second.workspace.id, ['sara@beh.test']);
    await populate(t, first.owner, first.workspace.id);
    await populate(t, second.owner, second.workspace.id);
    a = { workspaceId: first.workspace.id, ownerId: first.owner.userId };
    const { rows } = await t.admin.query<{ id: string }>(`select id from roles where workspace_id = $1 and key = 'member'`, [second.workspace.id]);
    b = { workspaceId: second.workspace.id, roleId: rows[0]?.id ?? '' };
    const tables = await t.admin.query<{ table_name: string }>(
      `select distinct c.table_name from information_schema.columns c
       join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema
       where c.table_schema = 'public' and c.column_name = 'workspace_id' and t.table_type = 'BASE TABLE'
         and c.table_name not like 'audit_logs\\_%'
       order by 1`,
    );
    tenantTables = [...tables.rows.map((row) => row.table_name), 'workspaces'].filter((name) => !CROSS_TENANT_BY_DESIGN.has(name));
  });

  afterAll(async () => {
    await t?.close();
  });

  it('forces row-level security on every tenant table', async () => {
    const { rows } = await t.admin.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class where relname = any($1)`,
      [tenantTables],
    );
    expect(rows).toHaveLength(tenantTables.length);
    for (const row of rows) expect([row.relname, row.relrowsecurity, row.relforcerowsecurity]).toEqual([row.relname, true, true]);
    expect(tenantTables).toEqual(
      expect.arrayContaining(['audit_logs', 'departments', 'invitations', 'role_permissions', 'roles', 'workspace_members', 'workspaces']),
    );
    expect(tenantTables).toEqual(
      expect.arrayContaining(['projects', 'tasks', 'board_columns', 'attachments', 'notes', 'calendar_events', 'notifications', 'activity_events']),
    );
    expect(tenantTables).toEqual(expect.arrayContaining(['conversations', 'conversation_members', 'messages', 'message_reactions', 'message_mentions']));
  });

  it('shows workspace A none of workspace B’s rows, in any tenant table', async () => {
    for (const table of tenantTables) {
      const column = table === 'workspaces' ? 'id' : 'workspace_id';
      const settings = OWNER_SCOPED.has(table) ? { workspaceId: a.workspaceId, userId: a.ownerId } : { workspaceId: a.workspaceId };
      const counts = await asApp(t.appPool, settings, async (client) => {
        const own = await client.query<{ count: string }>(`select count(*) from ${table} where ${column} = $1`, [a.workspaceId]);
        const other = await client.query<{ count: string }>(`select count(*) from ${table} where ${column} = $1`, [b.workspaceId]);
        const all = await client.query<{ count: string }>(`select count(*) from ${table} where ${column} is distinct from $1`, [a.workspaceId]);
        return { own: Number(own.rows[0]?.count), other: Number(other.rows[0]?.count), all: Number(all.rows[0]?.count) };
      });
      expect({ table, other: counts.other, foreign: counts.all }).toEqual({ table, other: 0, foreign: 0 });
      expect({ table, own: counts.own > 0 }).toEqual({ table, own: true });
    }
  });

  it('shows nothing at all without a tenant setting (fails closed)', async () => {
    for (const table of tenantTables) {
      const count = await asApp(t.appPool, {}, async (client) => Number((await client.query<{ count: string }>(`select count(*) from ${table}`)).rows[0]?.count));
      expect({ table, count }).toEqual({ table, count: 0 });
    }
    // Confirm there is data to hide.
    const { rows } = await t.admin.query<{ count: string }>('select count(*) from workspace_members');
    expect(Number(rows[0]?.count)).toBeGreaterThan(0);
  });

  it('refuses a row written into another tenant', async () => {
    await expect(
      asApp(t.appPool, { workspaceId: a.workspaceId }, (client) =>
        client.query(`insert into departments (workspace_id, name) values ($1, 'نفوذی')`, [b.workspaceId]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('refuses a cross-tenant reference through the composite foreign keys', async () => {
    // Even with RLS satisfied (the row is A's), A's member cannot point at B's role.
    await expect(
      asApp(t.appPool, { workspaceId: a.workspaceId }, (client) =>
        client.query(
          `insert into invitations (workspace_id, channel, address, role_id, token_hash, invited_by, expires_at)
           select $1, 'email', 'x@example.test', $2, sha256(gen_random_uuid()::text::bytea), owner_user_id, now() + interval '1 day' from workspaces where id = $1`,
          [a.workspaceId, b.roleId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('never lets the app role rewrite the audit trail', async () => {
    await expect(asApp(t.appPool, { workspaceId: a.workspaceId }, (client) => client.query(`update audit_logs set action = 'x'`))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asApp(t.appPool, { workspaceId: a.workspaceId }, (client) => client.query(`delete from audit_logs`))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asApp(t.appPool, {}, (client) => client.query(`delete from audit_logs_default`))).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps the search lookups (which run as the table owner) inside the caller’s workspace and notes', async () => {
    const ids = (client: pg.PoolClient, fn: 'search_task_ids' | 'search_note_ids') =>
      client.query<{ id: string }>(`select id from app.${fn}('%') as id`).then((result) => result.rows.map((row) => row.id).sort());
    const tasksOf = async (workspaceId: string) =>
      (await t.admin.query<{ id: string }>(`select id from tasks where workspace_id = $1 and deleted_at is null order by id`, [workspaceId])).rows.map((row) => row.id);
    const notesOf = async (workspaceId: string, ownerId: string) =>
      (await t.admin.query<{ id: string }>(`select id from notes where workspace_id = $1 and owner_id = $2 order by id`, [workspaceId, ownerId])).rows.map((row) => row.id);

    const own = await asApp(t.appPool, { workspaceId: a.workspaceId, userId: a.ownerId }, async (client) => ({
      tasks: await ids(client, 'search_task_ids'),
      notes: await ids(client, 'search_note_ids'),
    }));
    expect(own.tasks).toEqual(await tasksOf(a.workspaceId));
    expect(own.notes).toEqual(await notesOf(a.workspaceId, a.ownerId));
    expect(own.tasks.length * own.notes.length).toBeGreaterThan(0);

    // Someone else in the same workspace sees its tasks but none of the owner's notes.
    const stranger = '00000000-0000-4000-8000-000000000000';
    expect(await asApp(t.appPool, { workspaceId: a.workspaceId, userId: stranger }, (client) => ids(client, 'search_note_ids'))).toEqual([]);
    // Without the settings, nothing (fails closed like the policies).
    expect(await asApp(t.appPool, {}, (client) => ids(client, 'search_task_ids'))).toEqual([]);
    expect(await asApp(t.appPool, { userId: a.ownerId }, (client) => ids(client, 'search_note_ids'))).toEqual([]);
  });
});
