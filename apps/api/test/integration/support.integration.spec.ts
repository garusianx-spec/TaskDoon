import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupportUploadView, TicketMessageView, TicketThread, TicketView } from '@taskin/contracts';
import {
  bearer,
  createTestApp,
  ownerWithWorkspace,
  randomPhone,
  signIn,
  type Session,
  type TestApp,
} from './harness.js';

/** Fresh preserved database and private Redis prefix; no record, database, or S3 cleanup. */
describe('private support tickets, agent workflow and retained attachments', () => {
  let t: TestApp;
  let owner: Session;
  let other: Session;
  let agent: Session;
  let workspaceId: string;
  let agentWorkspaceId: string;
  beforeAll(async () => {
    t = await createTestApp({}, { preserveFixtures: true, fixtureKind: 'support' });
    console.info(`Preserved synthetic support fixture database: ${t.database}`);
    const a = await ownerWithWorkspace(t, 'Synthetic support QA');
    owner = a.owner;
    workspaceId = a.workspace.id;
    other = await signIn(t, randomPhone(), 'Synthetic support outsider');
    const b = await ownerWithWorkspace(t, 'Synthetic support agent workspace');
    agent = b.owner;
    agentWorkspaceId = b.workspace.id;
    // Provision only the newly created synthetic account; no live accounts or permissions change.
    await t.admin.query("update users set is_platform_admin=true,platform_admin_role='ADMIN' where id=$1", [
      agent.userId,
    ]);
  });
  afterAll(async () => {
    await t?.close();
  });
  const createBody = (extra = {}) => ({
    workspaceId,
    subject: 'درخواست آزمایشی پشتیبانی',
    department: 'TECHNICAL',
    priority: 'MEDIUM',
    body: 'شرح مصنوعی برای آزمون پشتیبانی',
    commandId: randomUUID(),
    ...extra,
  });
  const create = async (extra = {}): Promise<TicketView> =>
    (await t.http().post('/api/v1/support/tickets').set(bearer(owner)).send(createBody(extra)).expect(201))
      .body;
  const thread = async (id: string, who = owner, admin = false): Promise<TicketThread> =>
    (
      await t
        .http()
        .get(`/api/v1/${admin ? 'admin' : 'support'}/tickets/${id}`)
        .set(bearer(who))
        .expect(200)
    ).body;
  const reply = async (id: string, who: Session, admin = false, extra = {}): Promise<TicketMessageView> =>
    (
      await t
        .http()
        .post(`/api/v1/${admin ? 'admin' : 'support'}/tickets/${id}/messages`)
        .set(bearer(who))
        .send({ commandId: randomUUID(), body: 'پیام آزمایشی', ...extra })
        .expect(201)
    ).body;
  const upload = async (
    who: Session,
    scope: { workspaceId: string } | { ticketId: string; admin: boolean },
    name = 'qa.txt',
    bytes = Buffer.from('synthetic support attachment'),
  ) => {
    const base =
      'workspaceId' in scope
        ? '/api/v1/support/uploads'
        : `/api/v1/${scope.admin ? 'admin' : 'support'}/tickets/${scope.ticketId}/uploads`;
    const body = {
      commandId: randomUUID(),
      fileName: name,
      size: bytes.length,
      contentType: 'text/plain',
      ...('workspaceId' in scope ? { workspaceId: scope.workspaceId } : {}),
    };
    const r = await t.http().post(base).set(bearer(who)).send(body).expect(201);
    const plan = r.body as SupportUploadView;
    const post = async (content: Buffer) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(plan.plan!.fields)) form.set(k, v);
      form.set('Content-Type', 'text/plain');
      form.set('file', new Blob([new Uint8Array(content)], { type: 'text/plain' }), name);
      const res = await fetch(plan.plan!.url, { method: 'POST', body: form });
      expect(res.ok).toBe(true);
    };
    await post(bytes);
    return {
      base,
      body,
      plan,
      post,
      complete: () => t.http().post(`${base}/${plan.id}/complete`).set(bearer(who)),
    };
  };
  it('authenticates users and keeps support admin behind the existing privilege gate', async () => {
    await t.http().get('/api/v1/support/tickets').expect(401);
    await t.http().get('/api/v1/admin/tickets').set(bearer(owner)).expect(404);
    await t.http().get('/api/v1/admin/tickets').set(bearer(agent)).expect(200);
    const noStep = await signIn(t, agent.phone);
    await t
      .http()
      .get('/api/v1/admin/tickets')
      .set(bearer(noStep))
      .expect(401)
      .expect((r) => expect(r.body.code).toBe('STEP_UP_REQUIRED'));
  });
  it('serializes repeated creation, returns one reference and rejects altered replay', async () => {
    const body = createBody();
    const [a, b] = await Promise.all([
      t.http().post('/api/v1/support/tickets').set(bearer(owner)).send(body),
      t.http().post('/api/v1/support/tickets').set(bearer(owner)).send(body),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(a.body.reference).toMatch(/^TICK-\d+$/);
    expect((await thread(a.body.id)).messages).toHaveLength(1);
    await t
      .http()
      .post('/api/v1/support/tickets')
      .set(bearer(owner))
      .send({ ...body, subject: 'تغییر فرمان قبلی' })
      .expect(422);
  });
  it('requires active membership at creation but never shares tickets with another workspace member', async () => {
    await t.http().post('/api/v1/support/tickets').set(bearer(other)).send(createBody()).expect(403);
    const ticket = await create();
    await t.http().get(`/api/v1/support/tickets/${ticket.id}`).set(bearer(other)).expect(404);
    const rows = await t.http().get('/api/v1/support/tickets').set(bearer(other)).expect(200);
    expect(rows.body.items).toEqual([]);
    await t
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/close`)
      .set(bearer(other))
      .send({ expectedVersion: 1 })
      .expect(404);
  });
  it('rejects forged sender, internal-note and arbitrary external-file inputs', async () => {
    const ticket = await create();
    const path = `/api/v1/support/tickets/${ticket.id}/messages`;
    for (const extra of [
      { isInternal: true },
      { senderType: 'AGENT' },
      { attachments: [{ url: 'https://example.org/x' }] },
    ]) {
      await t
        .http()
        .post(path)
        .set(bearer(owner))
        .send({ commandId: randomUUID(), body: 'test', ...extra })
        .expect(400);
    }
    await t.http().post(path).set(bearer(owner)).send({ commandId: randomUUID(), body: '   ' }).expect(400);
  });
  it('isolates internal notes and does not expose their sequence, unread state or update timestamp', async () => {
    const ticket = await create();
    const note = await reply(ticket.id, agent, true, {
      isInternal: true,
      body: 'Synthetic internal-only note',
    });
    const u = await thread(ticket.id);
    expect(u.messages.some((m) => m.id === note.id)).toBe(false);
    expect(u.ticket.updatedAt).toBe(ticket.updatedAt);
    expect(u.ticket.version).toBe(ticket.version);
    expect(u.ticket.unreadCount).toBe(0);
    expect((await thread(ticket.id, agent, true)).messages.some((m) => m.id === note.id)).toBe(true);
    const own = await t
      .http()
      .post('/api/v1/support/tickets')
      .set(bearer(agent))
      .send(createBody({ workspaceId: agentWorkspaceId }))
      .expect(201);
    await reply(own.body.id, agent, true, { isInternal: true, body: 'private owner-admin note' });
    const ownPublic = await thread(own.body.id, agent, false);
    expect(ownPublic.messages).toHaveLength(1);
    expect(JSON.stringify(ownPublic)).not.toContain('private owner-admin note');
    // Even an admin using their ordinary user endpoint cannot see someone else's ticket.
    await t.http().get(`/api/v1/support/tickets/${ticket.id}`).set(bearer(agent)).expect(404);
  });
  it('updates public status and unread counts; reading an older sequence cannot hide a newer reply', async () => {
    const ticket = await create();
    const a = await reply(ticket.id, agent, true);
    const b = await reply(ticket.id, agent, true);
    const before = await thread(ticket.id);
    expect(before.ticket.status).toBe('ANSWERED');
    expect(before.ticket.unreadCount).toBe(2);
    await t
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/read`)
      .set(bearer(owner))
      .send({ throughSeq: a.publicSeq })
      .expect(204);
    const after = await thread(ticket.id);
    expect(after.ticket.unreadCount).toBe(1);
    expect(after.ticket.updatedAt).toBe(before.ticket.updatedAt);
    expect(after.ticket.version).toBe(before.ticket.version);
    await t
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/read`)
      .set(bearer(owner))
      .send({ throughSeq: b.publicSeq! + 1 })
      .expect(400);
    await reply(ticket.id, owner);
    expect((await thread(ticket.id)).ticket.status).toBe('IN_PROGRESS');
  });
  it('replays concurrent replies once and retains optimistic concurrency for close and assignment', async () => {
    const ticket = await create();
    const body = { commandId: randomUUID(), body: 'پاسخ فقط یک بار' };
    const path = `/api/v1/support/tickets/${ticket.id}/messages`;
    const [a, b] = await Promise.all([
      t.http().post(path).set(bearer(owner)).send(body),
      t.http().post(path).set(bearer(owner)).send(body),
    ]);
    expect(a.body.id).toBe(b.body.id);
    expect((await thread(ticket.id)).messages).toHaveLength(2);
    const adminPath = `/api/v1/admin/tickets/${ticket.id}`;
    await t
      .http()
      .patch(adminPath)
      .set(bearer(agent))
      .send({ expectedVersion: 1, priority: 'URGENT' })
      .expect(412);
    await t
      .http()
      .patch(adminPath)
      .set(bearer(agent))
      .send({ expectedVersion: 2, assignedAdminId: other.userId })
      .expect(400);
    const assigned = await t
      .http()
      .patch(adminPath)
      .set(bearer(agent))
      .send({ expectedVersion: 2, assignedAdminId: agent.userId, priority: 'URGENT', status: 'IN_PROGRESS' })
      .expect(200);
    expect(assigned.body.assignedAdminId).toBe(agent.userId);
    const closed = await t
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/close`)
      .set(bearer(owner))
      .send({ expectedVersion: assigned.body.version })
      .expect(200);
    expect(closed.body.status).toBe('CLOSED');
    await t
      .http()
      .post(path)
      .set(bearer(owner))
      .send({ commandId: randomUUID(), body: 'cannot reply' })
      .expect(409);
    await t
      .http()
      .post(`/api/v1/support/tickets/${ticket.id}/close`)
      .set(bearer(owner))
      .send({ expectedVersion: 1 })
      .expect(200);
    await t
      .http()
      .patch(adminPath)
      .set(bearer(agent))
      .send({ expectedVersion: closed.body.version, status: 'OPEN' })
      .expect(200);
    const filtered = await t
      .http()
      .get(`/api/v1/admin/tickets?priority=URGENT&assignedAdminId=${agent.userId}`)
      .set(bearer(agent))
      .expect(200);
    expect(filtered.body.items.map((x: TicketView) => x.id)).toContain(ticket.id);
  });
  it('validates real storage uploads, binds them once, and freezes bytes after completion', async () => {
    const up = await upload(owner, { workspaceId });
    const ready = await up.complete().expect(200);
    expect(ready.body.status).toBe('ready');
    const ticket = await create({ attachmentIds: [up.plan.id] });
    const initial = await thread(ticket.id);
    expect(initial.messages[0]!.attachments[0]!.id).toBe(up.plan.id);
    const replay = await t.http().post(up.base).set(bearer(owner)).send(up.body).expect(201);
    expect(replay.body.id).toBe(up.plan.id);
    expect(replay.body.plan).toBeUndefined();
    await up.post(Buffer.alloc(Buffer.byteLength('synthetic support attachment'), 0x78)); // Same length, still-authorized temporary POST.
    const link = await t
      .http()
      .get(`/api/v1/support/tickets/${ticket.id}/attachments/${up.plan.id}`)
      .set(bearer(owner))
      .expect(200);
    expect(await (await fetch(link.body.url)).text()).toBe('synthetic support attachment');
    await t
      .http()
      .get(`/api/v1/support/tickets/${ticket.id}/attachments/${up.plan.id}`)
      .set(bearer(other))
      .expect(404);
    const another = await create();
    await t
      .http()
      .post(`/api/v1/support/tickets/${another.id}/messages`)
      .set(bearer(owner))
      .send({ commandId: randomUUID(), body: 'cannot reuse', attachmentIds: [up.plan.id] })
      .expect(400);
  });
  it('allows a nonmember support agent to attach a private note without leaking its file', async () => {
    const ticket = await create();
    const up = await upload(agent, { ticketId: ticket.id, admin: true });
    await up.complete().expect(200);
    const note = await reply(ticket.id, agent, true, { isInternal: true, attachmentIds: [up.plan.id] });
    expect(note.attachments).toHaveLength(1);
    expect((await thread(ticket.id)).messages.flatMap((m) => m.attachments)).toEqual([]);
    await t
      .http()
      .get(`/api/v1/support/tickets/${ticket.id}/attachments/${up.plan.id}`)
      .set(bearer(owner))
      .expect(404);
    const link = await t
      .http()
      .get(`/api/v1/admin/tickets/${ticket.id}/attachments/${up.plan.id}`)
      .set(bearer(agent))
      .expect(200);
    expect((await fetch(link.body.url)).ok).toBe(true);
  });
  it('rejects spoofed bytes while retaining rejected fixture metadata and objects', async () => {
    const up = await upload(
      owner,
      { workspaceId },
      'qa.txt',
      Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]),
    );
    await up.complete().expect(422);
    expect(
      (await t.admin.query('select status from support_uploads where id=$1', [up.plan.id])).rows[0].status,
    ).toBe('rejected');
  });
  it('enforces RLS independently of route filters and keeps the admin pool read-only', async () => {
    const ticket = await create();
    const note = await reply(ticket.id, agent, true, { isInternal: true });
    const conn = await t.appPool.connect();
    try {
      await conn.query('begin');
      await conn.query("select set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)", [
        other.userId,
        workspaceId,
      ]);
      expect((await conn.query('select id from support_tickets where id=$1', [ticket.id])).rowCount).toBe(0);
      await conn.query('commit');
      await conn.query('begin');
      await conn.query("select set_config('app.user_id',$1,true)", [owner.userId]);
      expect((await conn.query('select id from support_messages where id=$1', [note.id])).rowCount).toBe(0);
      await conn.query('commit');
      expect(
        (await conn.query("select has_table_privilege(current_user,'support_messages','UPDATE') as allowed"))
          .rows[0].allowed,
      ).toBe(false);
    } finally {
      await conn.query('rollback');
      conn.release();
    }
    const grants = await t.admin.query(
      "select has_table_privilege('taskin_platform_admin','support_tickets','SELECT') as read,has_table_privilege('taskin_platform_admin','support_tickets','UPDATE') as write",
    );
    expect(grants.rows[0]).toEqual({ read: true, write: false });
    await expect(
      t.admin.query(
        "insert into support_messages(ticket_id,sender_id,sender_type,body,command_id,command_hash) values ($1,$2,'USER','bad sequence',$3,'synthetic')",
        [ticket.id, owner.userId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(t.rawLogs.join('\n')).not.toContain('Synthetic internal-only note');
  });
  it('keeps the requester history after membership changes and audits agent actions without body text', async () => {
    const a = await ownerWithWorkspace(t, 'Synthetic leaving support member');
    const created = await t
      .http()
      .post('/api/v1/support/tickets')
      .set(bearer(a.owner))
      .send(createBody({ workspaceId: a.workspace.id }))
      .expect(201);
    await t.admin.query("update workspace_members set status='left' where user_id=$1 and workspace_id=$2", [
      a.owner.userId,
      a.workspace.id,
    ]);
    await t.http().get(`/api/v1/support/tickets/${created.body.id}`).set(bearer(a.owner)).expect(200);
    await t.http().get('/api/v1/admin/tickets/agents').set(bearer(agent)).expect(200);
    const audit = await t.admin.query(
      "select action,metadata from platform_audit_logs where action like 'admin.support.%'",
    );
    expect(audit.rowCount).toBeGreaterThan(0);
    expect(JSON.stringify(audit.rows)).not.toContain('Synthetic internal-only note');
  });
});
