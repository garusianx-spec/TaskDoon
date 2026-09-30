import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConvertMessageResult, FileLink, MessageView, ProjectView, SubtaskView, TaskDetail, UploadView, WorkspaceView } from '@taskin/contracts';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createConversation, history, sendRest } from './chat-helpers.js';
import { connect, next, ok } from './socket-helpers.js';
import { createProject, createTask, expectStatus, outboxEvents, putProjectMember, usePlan, wsPath } from './work-helpers.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n'), Buffer.alloc(120, 0x20), Buffer.from('%%EOF\n')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 0)]);

describe('M4: message → task bridge, subtask order and file links', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let ali: Session;
  let sara: Session;
  let reza: Session;
  let project: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    ali = await addMember(t, owner, workspace.id, 'member');
    sara = await addMember(t, owner, workspace.id, 'member');
    reza = await addMember(t, owner, workspace.id, 'member');
    project = await createProject(t, owner, workspace.id);
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);

  /** Uploads `bytes` as `as` through the presigned POST and completes it; returns the attachment id. */
  const upload = async (as: Session, fileName: string, bytes: Buffer, contentType: string): Promise<string> => {
    const planned = await t.http().post(`${base()}/files/uploads`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send({ fileName, size: bytes.length, contentType });
    expectStatus(planned, 201);
    const plan = (planned.body as UploadView).plan;
    if (plan.kind !== 'post') throw new Error('expected a POST plan');
    const form = new FormData();
    for (const [name, value] of Object.entries(plan.fields)) form.append(name, value);
    form.append('Content-Type', contentType);
    form.append('file', new Blob([bytes], { type: contentType }), 'upload');
    expect((await fetch(plan.url, { method: 'POST', body: form })).status).toBeLessThan(300);
    const id = (planned.body as UploadView).attachment.id;
    expectStatus(await t.http().post(`${base()}/files/uploads/${id}/complete`).set(bearer(as)).send({}), 200);
    await t.flushNotifications();
    return id;
  };
  const convert = (as: Session, conversationId: string, messageId: string, body: Record<string, unknown>) =>
    t
      .http()
      .post(`${base()}/conversations/${conversationId}/messages/${messageId}/task`)
      .set(bearer(as))
      .set('Idempotency-Key', idempotencyKey())
      .send({ projectId: project.id, title: 'پیگیری پیام', ...body });
  const detail = async (as: Session, taskId: string) => {
    const response = await t.http().get(`${base()}/tasks/${taskId}`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as TaskDetail;
  };
  const link = (as: Session, attachmentId: string, disposition?: 'inline' | 'attachment') =>
    t.http().get(`${base()}/files/${attachmentId}/link${disposition ? `?disposition=${disposition}` : ''}`).set(bearer(as));

  describe('تبدیل پیام به وظیفه', () => {
    it('makes a linked task with the message’s file, announces it, and keeps one live task per message', async () => {
      const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'گروه پیگیری', memberIds: [sara.userId] });
      const fileId = await upload(ali, 'قرارداد.pdf', PDF, 'application/pdf');
      const sent = await sendRest(t, ali, workspace.id, group.id, { kind: 'file', attachmentId: fileId, text: 'نسخه نهایی قرارداد' });

      const listening = await connect(t.baseUrl, ali.accessToken);
      await ok(listening.socket, 'workspace:subscribe', { workspaceId: workspace.id });

      const created = await convert(sara, group.id, sent.id, { assigneeIds: [ali.userId], attachmentIds: [fileId] });
      expectStatus(created, 201);
      const result = created.body as ConvertMessageResult;
      expect(result.existing).toBe(false);
      expect(result.task).toMatchObject({ sourceMessageId: sent.id, title: 'پیگیری پیام', assigneeIds: [ali.userId] });
      // Sara links Ali's file: allowed because it is the message's own.
      expect(result.task.attachments).toEqual([expect.objectContaining({ id: fileId, uploadedById: ali.userId })]);
      expect(result.task.sourceMessage).toMatchObject({
        messageId: sent.id,
        accessible: true,
        conversationId: group.id,
        authorId: ali.userId,
        excerpt: 'نسخه نهایی قرارداد',
        kind: 'file',
        deleted: false,
      });

      // The conversation hears the link (code only) and a system line records it.
      const linked = await next(listening, 'message:task_linked', (envelope) => envelope.data.messageId === sent.id);
      expect(linked.data).toEqual({ conversationId: group.id, messageId: sent.id, taskId: result.task.id, code: result.task.code });
      expect(linked.eventId).not.toBeNull();
      listening.socket.disconnect();
      const page = await history(t, sara, workspace.id, group.id);
      expect(page.items.find((message) => message.id === sent.id)?.linkedTaskId).toBe(result.task.id);
      const line = page.items.at(-1) as MessageView;
      expect(line).toMatchObject({ kind: 'system', authorId: null, meta: { type: 'message_converted', params: { messageId: sent.id, taskId: result.task.id, code: result.task.code } } });

      // A second conversion, by anyone, returns the same task.
      const again = await convert(ali, group.id, sent.id, { title: 'دوباره' });
      expectStatus(again, 200);
      expect(again.body).toMatchObject({ existing: true, task: { id: result.task.id } });
      const { rows } = await t.admin.query('select count(*)::int as n from tasks where source_message_id = $1', [sent.id]);
      expect(rows[0].n).toBe(1);
      const audited = await t.admin.query("select changes from audit_logs where action = 'task.create_from_message' and resource_id = $1", [result.task.id]);
      expect(audited.rows).toHaveLength(1);
    });

    it('gives one task to two people converting at once', async () => {
      const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'هم‌زمان', memberIds: [sara.userId] });
      const sent = await sendRest(t, ali, workspace.id, group.id, { text: 'این را پیگیری کنیم' });
      const [one, two] = await Promise.all([convert(ali, group.id, sent.id, {}), convert(sara, group.id, sent.id, {})]);
      expect([one.status, two.status].sort()).toEqual([200, 201]);
      expect(one.body.task.id).toBe(two.body.task.id);
    });

    it('refuses other people’s files, system lines, deleted messages and outsiders', async () => {
      const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'مرزها', memberIds: [sara.userId] });
      const sent = await sendRest(t, ali, workspace.id, group.id, { text: 'متن ساده' });
      const saraFile = await upload(sara, 'دیگر.pdf', PDF, 'application/pdf');
      const foreign = await convert(sara, group.id, sent.id, { attachmentIds: [saraFile] });
      expectStatus(foreign, 400);
      expect(JSON.stringify(foreign.body.errors)).toContain('attachmentIds');

      // Reza is in the workspace but not in the group: the message does not exist for him.
      expectStatus(await convert(reza, group.id, sent.id, {}), 404);
      // A message of another conversation, named through this one.
      const other = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'دیگری', memberIds: [sara.userId] });
      const elsewhere = await sendRest(t, ali, workspace.id, other.id, { text: 'جای دیگر' });
      expectStatus(await convert(sara, group.id, elsewhere.id, {}), 404);

      const converted = (await convert(sara, group.id, sent.id, {})).body as ConvertMessageResult;
      const systemLine = (await history(t, sara, workspace.id, group.id)).items.find((message) => message.kind === 'system' && message.meta && 'params' in message.meta && message.meta.params.taskId === converted.task.id);
      expect(systemLine).toBeDefined();
      const refused = await convert(sara, group.id, systemLine?.id ?? '', {});
      expectStatus(refused, 422);
      expect(refused.body.code).toBe('MESSAGE_NOT_CONVERTIBLE');

      const doomed = await sendRest(t, ali, workspace.id, group.id, { text: 'حذف می‌شود' });
      expectStatus(await t.http().delete(`${base()}/conversations/${group.id}/messages/${doomed.id}`).set(bearer(ali)), 204);
      const gone = await convert(sara, group.id, doomed.id, {});
      expectStatus(gone, 410);
      expect(gone.body.code).toBe('MESSAGE_GONE');
    });

    it('keeps direct chats quiet, and tells people outside the chat only that the task came from one', async () => {
      const direct = await createConversation(t, ali, workspace.id, { kind: 'direct', userId: sara.userId });
      const sent = await sendRest(t, sara, workspace.id, direct.id, { text: 'بین خودمان' });
      const result = (await convert(ali, direct.id, sent.id, {})).body as ConvertMessageResult;
      const page = await history(t, ali, workspace.id, direct.id);
      expect(page.items.some((message) => message.kind === 'system')).toBe(false);

      // Reza can see the task (workspace-visible project) but not the direct chat.
      const forReza = await detail(reza, result.task.id);
      expect(forReza.sourceMessageId).toBe(sent.id);
      expect(forReza.sourceMessage).toEqual({
        messageId: sent.id,
        accessible: false,
        conversationId: null,
        authorId: null,
        excerpt: null,
        kind: null,
        sentAt: null,
        deleted: false,
      });
      expect((await detail(ali, result.task.id)).sourceMessage).toMatchObject({ accessible: true, conversationId: direct.id, excerpt: 'بین خودمان' });
    });

    it('needs the create permission in the target project', async () => {
      const privateProject = await createProject(t, owner, workspace.id, { visibility: 'private' });
      await putProjectMember(t, owner, workspace.id, privateProject.id, sara.userId, 'viewer');
      const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'دسترسی', memberIds: [sara.userId] });
      const sent = await sendRest(t, ali, workspace.id, group.id, { text: 'برای پروژه خصوصی' });
      expectStatus(await convert(sara, group.id, sent.id, { projectId: privateProject.id }), 403);
      expectStatus(await convert(ali, group.id, sent.id, { projectId: privateProject.id }), 404);
    });
  });

  describe('subtask order', () => {
    const titles = (task: TaskDetail) => task.subtasks.map((subtask) => subtask.title);
    const move = (as: Session, taskId: string, subtaskId: string, body: Record<string, unknown>) =>
      t.http().post(`${base()}/tasks/${taskId}/subtasks/${subtaskId}/move`).set(bearer(as)).send(body);

    it('moves a subtask between named neighbours, to either end, and tells the task’s viewers', async () => {
      const task = await createTask(t, owner, workspace.id, { projectId: project.id, subtasks: ['الف', 'ب', 'پ', 'ت'] });
      const id = (title: string) => task.subtasks.find((subtask) => subtask.title === title)?.id ?? '';

      const moved = await move(owner, task.id, id('ت'), { afterId: id('الف'), beforeId: id('ب') });
      expectStatus(moved, 200);
      expect((moved.body as SubtaskView).title).toBe('ت');
      expect(titles(await detail(owner, task.id))).toEqual(['الف', 'ت', 'ب', 'پ']);

      expectStatus(await move(owner, task.id, id('الف'), {}), 200);
      expect(titles(await detail(owner, task.id))).toEqual(['ت', 'ب', 'پ', 'الف']);

      expectStatus(await move(owner, task.id, id('پ'), { beforeId: id('ت') }), 200);
      expect(titles(await detail(owner, task.id))).toEqual(['پ', 'ت', 'ب', 'الف']);

      const events = await outboxEvents(t, 'task.updated', task.id);
      expect(events.filter((event) => JSON.stringify(event.payload.fields) === JSON.stringify(['subtasks'])).length).toBeGreaterThanOrEqual(3);
    });

    it('refuses a stale list, and keys stay short however often one slot is reused', async () => {
      const task = await createTask(t, owner, workspace.id, { projectId: project.id, subtasks: ['یک', 'دو', 'سه'] });
      const [one, two, three] = task.subtasks as [SubtaskView, SubtaskView, SubtaskView];
      const stale = await move(owner, task.id, three.id, { afterId: randomUUID() });
      expectStatus(stale, 409);
      expect(stale.body.code).toBe('SUBTASKS_CHANGED');
      expectStatus(await move(owner, task.id, one.id, { afterId: two.id, beforeId: two.id }), 409);
      expectStatus(await move(owner, task.id, randomUUID(), {}), 404);

      // Squeeze two subtasks into the gap after the first, over and over: the list rebalances.
      for (let round = 0; round < 60; round += 1) {
        const mover = round % 2 === 0 ? two : three;
        const stay = round % 2 === 0 ? three : two;
        expectStatus(await move(owner, task.id, mover.id, { afterId: one.id, beforeId: stay.id }), 200);
      }
      const after = await detail(owner, task.id);
      expect(titles(after)).toEqual(['یک', 'سه', 'دو']);
      expect(Math.max(...after.subtasks.map((subtask) => subtask.position.length))).toBeLessThanOrEqual(50);
    });

    it('needs the edit permission', async () => {
      const privateProject = await createProject(t, owner, workspace.id, { visibility: 'private' });
      await putProjectMember(t, owner, workspace.id, privateProject.id, reza.userId, 'viewer');
      const task = await createTask(t, owner, workspace.id, { projectId: privateProject.id, subtasks: ['اول', 'دوم'] });
      expectStatus(await move(reza, task.id, task.subtasks[1]?.id ?? '', {}), 403);
      expectStatus(await move(sara, task.id, task.subtasks[1]?.id ?? '', {}), 404);
    });
  });

  describe('file links', () => {
    it('lets a conversation’s members open its files, inline for images, and nobody else', async () => {
      const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'فایل‌ها', memberIds: [sara.userId] });
      const imageId = await upload(ali, 'نمودار.png', PNG, 'image/png');
      const pdfId = await upload(ali, 'گزارش.pdf', PDF, 'application/pdf');
      await sendRest(t, ali, workspace.id, group.id, { kind: 'file', attachmentId: imageId });
      await sendRest(t, ali, workspace.id, group.id, { kind: 'file', attachmentId: pdfId });

      const inline = await link(sara, imageId, 'inline');
      expectStatus(inline, 200);
      const shown = inline.body as FileLink;
      expect(shown.disposition).toBe('inline');
      expect(Date.parse(shown.expiresAt)).toBeGreaterThan(Date.now());
      const image = await fetch(shown.url);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/png');
      expect(image.headers.get('content-disposition') ?? '').toMatch(/^inline; filename\*=UTF-8''/);

      // A document never shows in place, whatever the caller asks.
      const pdf = (await link(sara, pdfId, 'inline')).body as FileLink;
      expect(pdf.disposition).toBe('attachment');
      expect((await fetch(pdf.url)).headers.get('content-disposition') ?? '').toMatch(/^attachment;/);

      expectStatus(await link(reza, imageId, 'inline'), 404);
      expectStatus(await link(reza, pdfId), 404);

      // Downloads are audited; inline views are not.
      const audited = await t.admin.query<{ resource_id: string }>("select resource_id from audit_logs where action = 'file.download' and resource_id = any($1)", [[imageId, pdfId]]);
      expect(audited.rows.map((row) => row.resource_id)).toEqual([pdfId]);
    });

    it('keeps an audio-only WebM (a browser voice note) as audio', async () => {
      const webm = Buffer.concat([
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        Buffer.from('\x42\x86\x81\x01webm\x18\x53\x80\x67Tracks\x86\x86A_OPUS\x63\xa2', 'latin1'),
        Buffer.alloc(200, 0),
      ]);
      const id = await upload(ali, 'voice.webm', webm, 'audio/webm;codecs=opus');
      const { rows } = await t.admin.query('select kind, mime_type from attachments where id = $1', [id]);
      expect(rows[0]).toEqual({ kind: 'audio', mime_type: 'audio/webm' });
      const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'صدا', memberIds: [sara.userId] });
      const voice = await sendRest(t, ali, workspace.id, group.id, { kind: 'voice', attachmentId: id, durationSec: 3, waveform: [10, 40, 80] });
      expect(voice.seq).toBe(1);
      expect(((await link(sara, id, 'inline')).body as FileLink).disposition).toBe('inline');
    });
  });
});
