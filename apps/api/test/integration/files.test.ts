import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AttachmentView, ProjectView, TaskDetail, UploadView, WorkspaceView } from '@taskin/contracts';
import { FilesService } from '../../src/modules/content/files.service.js';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createProject, createTask, expectStatus, usePlan, wsPath } from './work-helpers.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj << /Type /Catalog >> endobj\n'), Buffer.alloc(200, 0x20), Buffer.from('%%EOF\n')]);

/** Sends `bytes` exactly as a browser would with the presigned POST; returns the store's status. */
async function post(plan: UploadView['plan'], bytes: Buffer, contentType: string): Promise<number> {
  if (plan.kind !== 'post') throw new Error('expected a POST plan');
  const form = new FormData();
  for (const [name, value] of Object.entries(plan.fields)) form.append(name, value);
  form.append('Content-Type', contentType);
  form.append('file', new Blob([bytes], { type: contentType }), 'upload');
  return (await fetch(plan.url, { method: 'POST', body: form })).status;
}

describe('M2 checklist: uploads against the object store', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let project: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    project = await createProject(t, owner, workspace.id);
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const plan = async (as: Session, body: { fileName: string; size: number; contentType: string }, workspaceId = workspace.id) => {
    const response = await t.http().post(`${wsPath(workspaceId)}/files/uploads`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send(body);
    return response;
  };
  const complete = (as: Session, id: string, body: Record<string, unknown> = {}, workspaceId = workspace.id) =>
    t.http().post(`${wsPath(workspaceId)}/files/uploads/${id}/complete`).set(bearer(as)).send(body);
  const storage = async (workspaceId = workspace.id) =>
    (await t.admin.query<{ used: string; reserved: string }>('select storage_used_bytes as used, storage_reserved_bytes as reserved from workspaces where id = $1', [workspaceId])).rows[0];

  it('takes a file from plan to download, keeping a Persian name intact', async () => {
    const fileName = 'گزارش فصل «پاییز» ۱۴۰۵.pdf';
    const planned = await plan(owner, { fileName, size: PDF.length, contentType: 'application/pdf' });
    expectStatus(planned, 201);
    const upload = planned.body as UploadView;
    expect(upload.attachment).toMatchObject({ name: fileName, status: 'pending', kind: 'document', size: PDF.length });
    expect(Number((await storage())?.reserved)).toBe(PDF.length);

    expect(await post(upload.plan, PDF, 'application/pdf')).toBeLessThan(300);
    const done = await complete(owner, upload.attachment.id);
    expectStatus(done, 200);
    expect(done.body).toMatchObject({ status: 'scanning', mimeType: 'application/pdf' });
    expect(await storage()).toEqual({ used: String(PDF.length), reserved: '0' });
    await t.flushNotifications();

    const task = await createTask(t, owner, workspace.id, { projectId: project.id, attachmentIds: [upload.attachment.id] });
    expect(task.attachments).toEqual([expect.objectContaining({ id: upload.attachment.id, status: 'ready', name: fileName })]);

    const download = await t.http().get(`${base()}/files/${upload.attachment.id}/download`).set(bearer(owner)).redirects(0);
    expectStatus(download, 302);
    const file = await fetch(download.headers.location as string);
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer()).equals(PDF)).toBe(true);
    const disposition = file.headers.get('content-disposition') ?? '';
    expect(disposition).toMatch(/^attachment; filename\*=UTF-8''/);
    expect(decodeURIComponent(disposition.split("''")[1] ?? '')).toBe(fileName);
  });

  it('lets the store refuse a body larger than announced', async () => {
    const upload = (await plan(owner, { fileName: 'small.pdf', size: PDF.length, contentType: 'application/pdf' })).body as UploadView;
    expect(await post(upload.plan, Buffer.concat([PDF, PDF]), 'application/pdf')).toBeGreaterThanOrEqual(400);
    const done = await complete(owner, upload.attachment.id);
    expectStatus(done, 422);
  });

  it('rejects bytes that disagree with the claimed type, and executables whatever they claim', async () => {
    const before = await storage();
    const html = Buffer.from('<html><body><script>alert(1)</script></body></html>');
    const spoof = (await plan(owner, { fileName: 'photo.png', size: html.length, contentType: 'image/png' })).body as UploadView;
    expect(await post(spoof.plan, html, 'image/png')).toBeLessThan(300);
    const refused = await complete(owner, spoof.attachment.id);
    expectStatus(refused, 422);
    expect(refused.body.code).toBe('UPLOAD_INVALID');

    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(126, 0x90)]);
    const binary = (await plan(owner, { fileName: 'setup.pdf', size: exe.length, contentType: 'application/octet-stream' })).body as UploadView;
    expect(await post(binary.plan, exe, 'application/octet-stream')).toBeLessThan(300);
    expectStatus(await complete(owner, binary.attachment.id), 422);
    // Nothing was kept, and the reservations were released.
    expect(await storage()).toEqual(before);
    const { rows } = await t.admin.query('select status from attachments where id = any($1) order by created_at', [[spoof.attachment.id, binary.attachment.id]]);
    expect(rows.map((row) => row.status)).toEqual(['rejected', 'rejected']);
  });

  it('never lets 10 parallel uploads exceed the storage quota', async () => {
    const tiny = await ownerWithWorkspace(t, 'فضای کوچک');
    await t.admin.query(
      `insert into plans (id, name, limits) values ('test-tiny', 'آزمایشی', $1) on conflict (id) do update set limits = excluded.limits`,
      [JSON.stringify({ maxMembers: 10, storageBytes: 1000, maxFileBytes: 400, messageHistoryDays: null, maxProjects: null })],
    );
    await t.admin.query(`update workspaces set plan_id = 'test-tiny' where id = $1`, [tiny.workspace.id]);
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) => plan(tiny.owner, { fileName: `f${index}.pdf`, size: 300, contentType: 'application/pdf' }, tiny.workspace.id)),
    );
    expect(responses.filter((response) => response.status === 201)).toHaveLength(3);
    for (const response of responses.filter((entry) => entry.status !== 201)) expect(response.body.code).toBe('PLAN_LIMIT_REACHED');
    expect(await storage(tiny.workspace.id)).toEqual({ used: '0', reserved: '900' });
    const tooBig = await plan(tiny.owner, { fileName: 'big.pdf', size: 401, contentType: 'application/pdf' }, tiny.workspace.id);
    expectStatus(tooBig, 402);

    // Cancelling gives the bytes back.
    const first = responses.find((response) => response.status === 201)?.body as UploadView;
    expectStatus(await t.http().post(`${wsPath(tiny.workspace.id)}/files/uploads/${first.attachment.id}/abort`).set(bearer(tiny.owner)), 204);
    expect(await storage(tiny.workspace.id)).toEqual({ used: '0', reserved: '600' });
  });

  it('uploads files over 16 MB in presigned parts', async () => {
    const size = 17 * 1024 * 1024;
    const bytes = Buffer.alloc(size, 0x20);
    PDF.copy(bytes, 0);
    const planned = await plan(owner, { fileName: 'بزرگ.pdf', size, contentType: 'application/pdf' });
    expectStatus(planned, 201);
    const upload = planned.body as UploadView;
    if (upload.plan.kind !== 'multipart') throw new Error('expected a multipart plan');
    expect(upload.plan.parts).toHaveLength(3);
    const parts = [];
    for (const part of upload.plan.parts) {
      const chunk = bytes.subarray((part.partNumber - 1) * upload.plan.partSize, part.partNumber * upload.plan.partSize);
      const response = await fetch(part.url, { method: 'PUT', body: chunk });
      expect(response.status).toBe(200);
      parts.push({ partNumber: part.partNumber, etag: response.headers.get('etag') ?? '' });
    }
    const done = await complete(owner, upload.attachment.id, { parts });
    expectStatus(done, 200);
    expect((done.body as AttachmentView).size).toBe(size);
  });

  it('serves a file only to its uploader and to people who can see a task it is on', async () => {
    const outsider = await addMember(t, owner, workspace.id, 'member');
    const secret = await createProject(t, owner, workspace.id, { visibility: 'private' });
    const upload = (await plan(owner, { fileName: 'secret.pdf', size: PDF.length, contentType: 'application/pdf' })).body as UploadView;
    await post(upload.plan, PDF, 'application/pdf');
    expectStatus(await complete(owner, upload.attachment.id), 200);
    await t.flushNotifications();
    const task: TaskDetail = await createTask(t, owner, workspace.id, { projectId: secret.id, attachmentIds: [upload.attachment.id] });
    expect(task.attachmentCount).toBe(1);
    expectStatus(await t.http().get(`${base()}/files/${upload.attachment.id}/download`).set(bearer(outsider)).redirects(0), 404);
    // Nobody links an upload that is not theirs.
    const open = await createProject(t, owner, workspace.id);
    const theirTask = await createTask(t, outsider, workspace.id, { projectId: open.id });
    const steal = await t.http().post(`${base()}/tasks/${theirTask.id}/attachments`).set(bearer(outsider)).send({ attachmentId: upload.attachment.id });
    expectStatus(steal, 400);
  });

  it('collects uploads never completed within a day, releasing their reservation', async () => {
    const upload = (await plan(owner, { fileName: 'forgotten.pdf', size: 123, contentType: 'application/pdf' })).body as UploadView;
    const before = await storage();
    await t.admin.query(`update attachments set created_at = now() - interval '25 hours' where id = $1`, [upload.attachment.id]);
    const collected = await t.app.get(FilesService).collectGarbage();
    expect(collected.stale).toBeGreaterThanOrEqual(1);
    const after = await storage();
    expect(Number(after?.reserved)).toBe(Number(before?.reserved) - 123);
    const { rows } = await t.admin.query('select status from attachments where id = $1', [upload.attachment.id]);
    expect(rows[0].status).toBe('deleted');
  });
});
