import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LabelView, ProjectView, TaskDetail, TaskPage, TaskPreview, WorkspaceView } from '@taskin/contracts';
import { Clock } from '../../src/platform/clock/clock.js';
import { addMember, bearer, createTestApp, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createProject, createTask, expectStatus, outboxEvents, putProjectMember, usePlan, wsPath } from './work-helpers.js';

describe('M2: tasks', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let member: Session;
  let guest: Session;
  let project: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    member = await addMember(t, owner, workspace.id, 'member');
    guest = await addMember(t, owner, workspace.id, 'guest');
    project = await createProject(t, owner, workspace.id, { key: 'CRM', name: 'مشتریان' });
  });
  afterAll(async () => {
    t?.app.get(Clock).pin(null);
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const page = async (as: Session, query: string) => {
    const response = await t.http().get(`${base()}/tasks?${query}`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as TaskPage;
  };

  it('numbers tasks per project and fills in the defaults', async () => {
    const first = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'تماس با مشتری' });
    const second = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'ارسال پیش‌فاکتور', priority: 'high', subtasks: ['تهیه', 'ارسال'] });
    expect(first.code).toMatch(/^CRM-\d+$/);
    expect(Number(second.code.split('-')[1])).toBe(Number(first.code.split('-')[1]) + 1);
    expect(first).toMatchObject({ status: 'todo', priority: 'medium', version: 1, assigneeIds: [], createdById: owner.userId });
    expect(first.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(second.subtasks.map((subtask) => subtask.title)).toEqual(['تهیه', 'ارسال']);
    expect(second.timeline[0]).toMatchObject({ type: 'created', actorId: owner.userId });
    expect((await outboxEvents(t, 'task.created', first.id))[0]?.payload).toMatchObject({ taskId: first.id, projectId: project.id, version: 1 });
  });

  it('accepts Persian digits in dates and refuses a due date before the start', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, startDate: '۲۰۲۶-۱۰-۰۱', dueDate: '2026-10-05' });
    expect(task).toMatchObject({ startDate: '2026-10-01', dueDate: '2026-10-05' });
    const backwards = await t.http().post(`${base()}/tasks`).set(bearer(owner)).set('Idempotency-Key', `back-${Date.now()}`).send({ projectId: project.id, title: 'x', startDate: '2026-10-05', dueDate: '2026-10-01' });
    expectStatus(backwards, 400);
    const impossible = await t.http().post(`${base()}/tasks`).set(bearer(owner)).set('Idempotency-Key', `feb-${Date.now()}`).send({ projectId: project.id, title: 'x', dueDate: '2026-02-30' });
    expectStatus(impossible, 400);
  });

  it('assigns only people who can see the project, and tells the new assignees', async () => {
    const outsider = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'برای عضو' });
    const refused = await t
      .http()
      .patch(`${base()}/tasks/${outsider.id}`)
      .set(bearer(owner))
      .set('If-Match', `"${outsider.version}"`)
      .send({ assigneeIds: [guest.userId] });
    expectStatus(refused, 422);
    expect(refused.body.code).toBe('ASSIGNEE_NO_ACCESS');

    const assigned = await t.http().patch(`${base()}/tasks/${outsider.id}`).set(bearer(owner)).set('If-Match', `"${outsider.version}"`).send({ assigneeIds: [member.userId] });
    expectStatus(assigned, 200);
    expect(assigned.body).toMatchObject({ assigneeIds: [member.userId], version: outsider.version + 1 });
    const [event] = await outboxEvents(t, 'task.assigned', outsider.id);
    expect(event?.payload).toMatchObject({ assigneeIds: [member.userId], code: outsider.code, title: 'برای عضو' });
    expect(event?.headers).toMatchObject({ actorId: owner.userId, requestId: expect.any(String) });
  });

  it('keeps edit and assign apart at field level', async () => {
    const guestProject = await createProject(t, owner, workspace.id);
    await putProjectMember(t, owner, workspace.id, guestProject.id, guest.userId, 'viewer');
    const task = await createTask(t, owner, workspace.id, { projectId: guestProject.id });
    const edit = await t.http().patch(`${base()}/tasks/${task.id}`).set(bearer(guest)).set('If-Match', `"${task.version}"`).send({ title: 'ناظر' });
    expectStatus(edit, 403);
    // Members hold boards edit and assign by default.
    const ok = await t.http().patch(`${base()}/tasks/${task.id}`).set(bearer(member)).set('If-Match', `"${task.version}"`).send({ title: 'عضو', priority: 'urgent' });
    expectStatus(ok, 200);
  });

  it('labels tasks with the workspace’s labels', async () => {
    const created = await t.http().post(`${base()}/labels`).set(bearer(owner)).send({ name: 'فوری', tone: 'red' });
    expectStatus(created, 201);
    const label = created.body as LabelView;
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, labelIds: [label.id] });
    expect(task.labelIds).toEqual([label.id]);
    const unknown = await t.http().patch(`${base()}/tasks/${task.id}`).set(bearer(owner)).set('If-Match', `"${task.version}"`).send({ labelIds: [owner.userId] });
    expectStatus(unknown, 400);
    expectStatus(await t.http().delete(`${base()}/labels/${label.id}`).set(bearer(owner)), 204);
    expect(((await t.http().get(`${base()}/tasks/${task.id}`).set(bearer(owner))).body as TaskDetail).labelIds).toEqual([]);
  });

  it('serves the smart views: my tasks, starred and due soon (in the workspace’s time zone)', async () => {
    const mine = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'مال من', assigneeIds: [member.userId] });
    const starred = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'ستاره‌دار' });
    expectStatus(await t.http().put(`${base()}/tasks/${starred.id}/star`).set(bearer(member)), 204);
    expect((await page(member, 'smart=my-tasks')).items.map((item) => item.id)).toContain(mine.id);
    expect((await page(member, 'smart=my-tasks')).items.map((item) => item.id)).not.toContain(starred.id);
    expect((await page(member, 'smart=starred')).items.map((item) => item.id)).toEqual([starred.id]);
    expect((await page(owner, 'smart=starred')).items).toEqual([]);

    // 00:30 on 7 October 2026 in Tehran is still 6 October in UTC. "Today" is the Tehran date, so
    // a task due 10 October (three days on) is due soon and one due 11 October is not; had the
    // server used the UTC date, the 10 October task would be missing.
    t.app.get(Clock).pin(new Date('2026-10-06T21:00:00Z'));
    const soon = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'نزدیک', startDate: '2026-10-01', dueDate: '2026-10-10' });
    const later = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'دور', startDate: '2026-10-01', dueDate: '2026-10-11' });
    const overdue = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'گذشته', startDate: '2026-09-01', dueDate: '2026-09-20' });
    const due = (await page(owner, 'smart=due-soon&limit=200')).items.map((item) => item.id);
    expect(due).toContain(soon.id);
    expect(due).toContain(overdue.id);
    expect(due).not.toContain(later.id);
    // The default start date is also the Tehran date.
    const today = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'امروز' });
    expect(today.startDate).toBe('2026-10-07');
    t.app.get(Clock).pin(null);
  });

  it('searches codes, titles and descriptions with Persian normalisation', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'گزارش مالي ۱۴۰۵', description: 'بررسي كتابخانه' });
    for (const q of ['مالی', 'مالي', '1405', 'کتابخانه', task.code.toLowerCase()]) {
      expect({ q, found: (await page(owner, `q=${encodeURIComponent(q)}`)).items.map((item) => item.id).includes(task.id) }).toEqual({ q, found: true });
    }
    expect((await page(owner, `q=${encodeURIComponent('ناموجود')}`)).items).toEqual([]);
  });

  it('pages with keyset cursors, never repeating or skipping', async () => {
    const other = await createProject(t, owner, workspace.id);
    const created = [];
    for (let index = 0; index < 7; index += 1) created.push((await createTask(t, owner, workspace.id, { projectId: other.id, title: `صفحه ${index}` })).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const result: TaskPage = await page(owner, `projectId=${other.id}&limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
    } while (cursor);
    expect(seen).toEqual([...created].reverse());
    expectStatus(await t.http().get(`${base()}/tasks?cursor=nonsense`).set(bearer(owner)), 400);
  });

  it('lists the cards overlapping a date range for the Gantt chart', async () => {
    const other = await createProject(t, owner, workspace.id);
    const inside = await createTask(t, owner, workspace.id, { projectId: other.id, startDate: '2026-11-01', dueDate: '2026-11-20' });
    const spanning = await createTask(t, owner, workspace.id, { projectId: other.id, startDate: '2026-10-01', dueDate: '2026-12-31' });
    const outside = await createTask(t, owner, workspace.id, { projectId: other.id, startDate: '2027-01-02', dueDate: '2027-01-05' });
    const response = await t.http().get(`${base()}/tasks/gantt?projectId=${other.id}&from=2026-11-05&to=2026-11-30`).set(bearer(owner));
    expectStatus(response, 200);
    const ids = (response.body as { id: string }[]).map((card) => card.id);
    expect(ids).toEqual(expect.arrayContaining([inside.id, spanning.id]));
    expect(ids).not.toContain(outside.id);
  });

  it('manages subtasks and comments, with authors owning their comments', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'بحث' });
    const subtask = await t.http().post(`${base()}/tasks/${task.id}/subtasks`).set(bearer(member)).send({ title: 'گام اول' });
    expectStatus(subtask, 201);
    const done = await t.http().patch(`${base()}/tasks/${task.id}/subtasks/${subtask.body.id}`).set(bearer(member)).send({ done: true });
    expect(done.body).toMatchObject({ done: true });
    const comment = await t.http().post(`${base()}/tasks/${task.id}/comments`).set(bearer(member)).send({ body: 'نظر من' });
    expectStatus(comment, 201);
    const reply = await t.http().post(`${base()}/tasks/${task.id}/comments`).set(bearer(owner)).send({ body: 'پاسخ', replyToId: comment.body.id });
    expectStatus(reply, 201);
    expectStatus(await t.http().patch(`${base()}/tasks/${task.id}/comments/${comment.body.id}`).set(bearer(owner)).send({ body: 'دست‌کاری' }), 404);
    expectStatus(await t.http().patch(`${base()}/tasks/${task.id}/comments/${comment.body.id}`).set(bearer(member)).send({ body: 'ویرایش' }), 200);
    const detail = (await t.http().get(`${base()}/tasks/${task.id}`).set(bearer(owner))).body as TaskDetail;
    expect(detail).toMatchObject({ subtaskCount: 1, subtaskDoneCount: 1, commentCount: 2 });
    expect(detail.comments.map((entry) => [entry.body, entry.editedAt !== null])).toEqual([
      ['ویرایش', true],
      ['پاسخ', false],
    ]);
    const [event] = (await outboxEvents(t, 'task.commented', task.id)).slice(-1);
    expect(event?.payload).toMatchObject({ replyToAuthorId: member.userId, excerpt: 'پاسخ' });
    expectStatus(await t.http().delete(`${base()}/tasks/${task.id}/comments/${comment.body.id}`).set(bearer(owner)), 204);
    expectStatus(await t.http().delete(`${base()}/tasks/${task.id}/subtasks/${subtask.body.id}`).set(bearer(member)), 204);
  });

  it('previews a task: the code for anyone, the rest only with access', async () => {
    const secret = await createProject(t, owner, workspace.id, { visibility: 'private' });
    const task = await createTask(t, owner, workspace.id, { projectId: secret.id, title: 'پنهان' });
    const outsider = (await t.http().get(`${base()}/tasks/${task.id}/preview`).set(bearer(member))).body as TaskPreview;
    expect(outsider).toEqual({ id: task.id, code: task.code, accessible: false, title: null, status: null, projectId: null });
    const insider = (await t.http().get(`${base()}/tasks/${task.id}/preview`).set(bearer(owner))).body as TaskPreview;
    expect(insider).toMatchObject({ accessible: true, title: 'پنهان' });
  });

  it('soft-deletes tasks', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'حذفی' });
    expectStatus(await t.http().delete(`${base()}/tasks/${task.id}`).set(bearer(member)), 403);
    expectStatus(await t.http().delete(`${base()}/tasks/${task.id}`).set(bearer(owner)), 204);
    expectStatus(await t.http().get(`${base()}/tasks/${task.id}`).set(bearer(owner)), 404);
    expect((await outboxEvents(t, 'task.deleted', task.id)).length).toBe(1);
  });
});
