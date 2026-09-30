import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DepartmentView, UploadTicket, WorkspaceView } from '@taskin/contracts';
import { WorkspacesService } from '../../src/modules/workspaces/workspaces.service.js';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, randomPhone, type Session, signIn, stepUp, type TestApp } from './harness.js';
import { createProject, createTask } from './work-helpers.js';

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Uploads `bytes` to object storage exactly as a browser would, with the presigned POST. */
async function upload(ticket: UploadTicket, bytes: Buffer, contentType: string): Promise<number> {
  const form = new FormData();
  for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
  form.append('Content-Type', contentType);
  form.append('file', new Blob([bytes], { type: contentType }), 'icon');
  return (await fetch(ticket.url, { method: 'POST', body: form })).status;
}

describe('workspaces', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('needs an admin password to own a workspace', async () => {
    const plain = await signIn(t, randomPhone());
    const response = await t.http().post('/api/v1/workspaces').set(bearer(plain)).set('Idempotency-Key', idempotencyKey()).send({ name: 'بدون رمز' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PASSWORD_REQUIRED');
  });

  it('creates a workspace with roles, departments, a monogram and the free plan', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t, 'تیم زیرساخت');
    expect(workspace).toMatchObject({ name: 'تیم زیرساخت', ownerId: owner.userId, planId: 'free', memberCount: 1, iconUrl: null });
    expect(workspace.initials).toHaveLength(2);
    expect(workspace.limits.maxMembers).toBeGreaterThan(0);
    const departments = await t.http().get(`/api/v1/workspaces/${workspace.id}/departments`).set(bearer(owner));
    expect((departments.body as DepartmentView[]).map((d) => d.name)).toContain('مهندسی و توسعه');
  });

  it('takes an icon through a presigned upload, checking its real type and size', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const ticket = (await t.http().post('/api/v1/uploads/workspace-icon').set(bearer(owner))).body as UploadTicket;
    expect(await upload(ticket, PNG_1x1, 'image/png')).toBeLessThan(300);
    const updated = await t.http().patch(`/api/v1/workspaces/${workspace.id}`).set(bearer(owner)).send({ iconUploadKey: ticket.key });
    expect(updated.status).toBe(200);
    const icon = await fetch((updated.body as WorkspaceView).iconUrl ?? '');
    expect(icon.status).toBe(200);
    expect(Buffer.from(await icon.arrayBuffer()).equals(PNG_1x1)).toBe(true);

    // A text file dressed up as an image is refused on its magic number.
    const fake = (await t.http().post('/api/v1/uploads/workspace-icon').set(bearer(owner))).body as UploadTicket;
    expect(await upload(fake, Buffer.from('not an image at all'), 'image/png')).toBeLessThan(300);
    const refused = await t.http().patch(`/api/v1/workspaces/${workspace.id}`).set(bearer(owner)).send({ iconUploadKey: fake.key });
    expect(refused.body.code).toBe('UPLOAD_INVALID');

    // Someone else's upload key cannot be claimed.
    const { owner: other } = await ownerWithWorkspace(t);
    const theirs = (await t.http().post('/api/v1/uploads/workspace-icon').set(bearer(other))).body as UploadTicket;
    const stolen = await t.http().patch(`/api/v1/workspaces/${workspace.id}`).set(bearer(owner)).send({ iconUploadKey: theirs.key });
    expect(stolen.body.code).toBe('UPLOAD_INVALID');
  });

  it('lets the store enforce the 1 MB icon limit', async () => {
    const { owner } = await ownerWithWorkspace(t);
    const ticket = (await t.http().post('/api/v1/uploads/workspace-icon').set(bearer(owner))).body as UploadTicket;
    expect(await upload(ticket, Buffer.alloc(ticket.maxBytes + 1, 1), 'image/png')).toBeGreaterThanOrEqual(400);
  });

  it('updates settings, refusing unknown time zones', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const ok = await t
      .http()
      .patch(`/api/v1/workspaces/${workspace.id}`)
      .set(bearer(owner))
      .send({ description: 'سرورها و شبکه', settings: { timeZone: 'Asia/Tehran', allowedEmailDomains: ['rahnama.ir'] } });
    expect(ok.body.settings).toMatchObject({ timeZone: 'Asia/Tehran', allowedEmailDomains: ['rahnama.ir'], weekStart: 'saturday' });
    const bad = await t.http().patch(`/api/v1/workspaces/${workspace.id}`).set(bearer(owner)).send({ settings: { timeZone: 'Mars/Olympus' } });
    expect(bad.status).toBe(400);
  });

  it('lets only the owner delete, with a step-up and the exact name; members then get 404', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t, 'فضای موقت');
    const admin = await addMember(t, owner, workspace.id, 'admin');
    const byAdmin = await t.http().delete(`/api/v1/workspaces/${workspace.id}`).set(bearer(admin)).send({ confirmName: 'فضای موقت' });
    expect(byAdmin.status).toBe(403);
    const stepped = await stepUp(t, owner);
    const wrongName = await t.http().delete(`/api/v1/workspaces/${workspace.id}`).set(bearer(stepped)).send({ confirmName: 'فضای موقتی' });
    expect(wrongName.body.code).toBe('WORKSPACE_NAME_MISMATCH');
    expect((await t.http().delete(`/api/v1/workspaces/${workspace.id}`).set(bearer(stepped)).send({ confirmName: 'فضای موقت' })).status).toBe(204);
    expect((await t.http().get(`/api/v1/workspaces/${workspace.id}`).set(bearer(owner))).status).toBe(404);
    expect((await t.http().get(`/api/v1/workspaces/${workspace.id}`).set(bearer(admin))).status).toBe(404);
    const me = await t.http().get('/api/v1/me').set(bearer(owner));
    expect(me.body.workspaces.map((w: { id: string }) => w.id)).not.toContain(workspace.id);
  });

  it('purges a deleted workspace, files included, once its grace period ends', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t, 'پاکسازی');
    const ticket = (await t.http().post('/api/v1/uploads/workspace-icon').set(bearer(owner))).body as UploadTicket;
    await upload(ticket, PNG_1x1, 'image/png');
    await t.http().patch(`/api/v1/workspaces/${workspace.id}`).set(bearer(owner)).send({ iconUploadKey: ticket.key });
    // Work in every M2 table the purge must cascade through.
    const ws = `/api/v1/workspaces/${workspace.id}`;
    const project = await createProject(t, owner, workspace.id);
    const label = (await t.http().post(`${ws}/labels`).set(bearer(owner)).send({ name: 'برچسب' })).body;
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, assigneeIds: [owner.userId], labelIds: [label.id], subtasks: ['گام'] });
    await t.http().post(`${ws}/tasks/${task.id}/comments`).set(bearer(owner)).send({ body: 'نظر' });
    await t.http().put(`${ws}/tasks/${task.id}/star`).set(bearer(owner));
    const note = await t.http().post(`${ws}/notes`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ title: 'یادداشت', body: '- [ ] کار' });
    await t.http().post(`${ws}/notes/${note.body.id}/task`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ projectId: project.id });
    await t.http().post(`${ws}/calendar/events`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ kind: 'meeting', title: 'جلسه', date: '2030-01-01', startTime: '09:00', attendeeIds: [owner.userId] });
    await t.flushNotifications();
    const stepped = await stepUp(t, owner);
    await t.http().delete(`/api/v1/workspaces/${workspace.id}`).set(bearer(stepped)).send({ confirmName: 'پاکسازی' });
    const service = t.app.get(WorkspacesService);
    expect(await service.purgeDue()).toBe(0);
    await t.admin.query(`update workspaces set purge_after = now() - interval '1 minute' where id = $1`, [workspace.id]);
    expect(await service.purgeDue()).toBe(1);
    for (const table of [
      'workspaces',
      'workspace_members',
      'roles',
      'role_permissions',
      'departments',
      'workflows',
      'board_columns',
      'projects',
      'project_members',
      'tasks',
      'task_assignees',
      'task_labels',
      'subtasks',
      'task_comments',
      'labels',
      'notes',
      'note_categories',
      'calendar_events',
      'calendar_event_attendees',
    ]) {
      const column = table === 'workspaces' ? 'id' : 'workspace_id';
      const { rows } = await t.admin.query(`select 1 from ${table} where ${column} = $1`, [workspace.id]);
      expect({ table, rows: rows.length }).toEqual({ table, rows: 0 });
    }
    const audit = await t.admin.query(`select action from audit_logs where workspace_id = $1 and action = 'workspace.purge'`, [workspace.id]);
    expect(audit.rows).toHaveLength(1);
  });

  it('transfers ownership to a member with a password; the old owner becomes an admin', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const successor = await addMember(t, owner, workspace.id, 'member');
    const stepped = await stepUp(t, owner);
    const refused = await t.http().post(`/api/v1/workspaces/${workspace.id}/transfer-ownership`).set(bearer(stepped)).send({ userId: successor.userId });
    expect(refused.body.code).toBe('PASSWORD_REQUIRED');
    const admin = await addMember(t, owner, workspace.id, 'admin');
    const done = await t.http().post(`/api/v1/workspaces/${workspace.id}/transfer-ownership`).set(bearer(stepped)).send({ userId: admin.userId });
    expect(done.status).toBe(204);
    const view = await t.http().get(`/api/v1/workspaces/${workspace.id}`).set(bearer(admin));
    expect(view.body.ownerId).toBe(admin.userId);
    const permissions = await t.http().get(`/api/v1/workspaces/${workspace.id}/me/permissions`).set(bearer(owner));
    expect(permissions.body).toMatchObject({ role: 'admin', isOwner: false });
  });

  describe('departments and members', () => {
    let owner: Session;
    let workspace: WorkspaceView;

    beforeAll(async () => {
      ({ owner, workspace } = await ownerWithWorkspace(t));
    });

    it('creates, renames and deletes a department; refuses deleting one in use', async () => {
      const base = `/api/v1/workspaces/${workspace.id}/departments`;
      const created = await t.http().post(base).set(bearer(owner)).send({ name: 'پژوهش' });
      expect(created.status).toBe(201);
      const duplicate = await t.http().post(base).set(bearer(owner)).send({ name: 'پژوهش' });
      expect(duplicate.status).toBe(409);
      const renamed = await t.http().patch(`${base}/${created.body.id}`).set(bearer(owner)).send({ name: 'پژوهش و توسعه' });
      expect(renamed.body.name).toBe('پژوهش و توسعه');

      const member = await addMember(t, owner, workspace.id, 'member');
      await t.http().patch(`/api/v1/workspaces/${workspace.id}/members/${member.userId}`).set(bearer(owner)).send({ departmentId: created.body.id });
      const inUse = await t.http().delete(`${base}/${created.body.id}`).set(bearer(owner));
      expect(inUse.body.code).toBe('DEPARTMENT_IN_USE');
      await t.http().patch(`/api/v1/workspaces/${workspace.id}/members/${member.userId}`).set(bearer(owner)).send({ departmentId: null });
      expect((await t.http().delete(`${base}/${created.body.id}`).set(bearer(owner))).status).toBe(204);
    });

    it('lists members with their roles, and lets each set their own presence', async () => {
      const member = await addMember(t, owner, workspace.id, 'guest');
      const presence = await t.http().patch(`/api/v1/workspaces/${workspace.id}/me/presence`).set(bearer(member)).send({ presence: 'busy', statusMessage: 'در جلسه' });
      expect(presence.status).toBe(204);
      const list = await t.http().get(`/api/v1/workspaces/${workspace.id}/members`).set(bearer(owner));
      const entry = list.body.find((m: { userId: string }) => m.userId === member.userId);
      expect(entry).toMatchObject({ role: 'guest', presence: 'busy', statusMessage: 'در جلسه', status: 'active' });
      expect(list.body.find((m: { userId: string }) => m.userId === owner.userId)).toMatchObject({ role: 'owner', isOwner: true });
    });

    it('suspends a member: they keep their seat but lose access', async () => {
      const member = await addMember(t, owner, workspace.id, 'member');
      const suspend = await t.http().patch(`/api/v1/workspaces/${workspace.id}/members/${member.userId}`).set(bearer(owner)).send({ status: 'suspended' });
      expect(suspend.body.status).toBe('suspended');
      expect((await t.http().get(`/api/v1/workspaces/${workspace.id}`).set(bearer(member))).status).toBe(404);
    });
  });
});
