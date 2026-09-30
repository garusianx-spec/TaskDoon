import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ActivityPage,
  CalendarEventView,
  CalendarView,
  ConvertNoteResult,
  MonthlyTaskReport,
  NoteCategoryView,
  NotePage,
  NoteView,
  NotificationPage,
  ProjectView,
  TaskCard,
  WorkspaceView,
} from '@taskin/contracts';
import { gregorianToJalali, isJalaliLeapYear, jalaliToGregorian } from '@taskin/jalali';
import { CalendarService } from '../../src/modules/content/calendar.service.js';
import { FeedService } from '../../src/modules/content/feed.service.js';
import { Clock } from '../../src/platform/clock/clock.js';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createProject, createTask, expectStatus, getWorkflow, outboxEvents, usePlan, wsPath } from './work-helpers.js';

describe('M2: notes', () => {
  let t: TestApp;
  let owner: Session;
  let member: Session;
  let workspace: WorkspaceView;
  let project: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    member = await addMember(t, owner, workspace.id, 'member');
    project = await createProject(t, owner, workspace.id);
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const categories = async (as: Session) => (await t.http().get(`${base()}/note-categories`).set(bearer(as))).body as NoteCategoryView[];
  const createNote = async (as: Session, body: Record<string, unknown>) => {
    const response = await t.http().post(`${base()}/notes`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send(body);
    expectStatus(response, 201);
    return response.body as NoteView;
  };

  it('gives every member the four built-in notebooks, privately', async () => {
    const mine = await categories(owner);
    expect(mine.map((category) => [category.key, category.builtIn])).toEqual([
      ['personal', true],
      ['work', true],
      ['ideas', true],
      ['meetings', true],
    ]);
    const theirs = await categories(member);
    expect(theirs.map((category) => category.id)).not.toEqual(mine.map((category) => category.id));
    const note = await createNote(owner, { title: 'خصوصی', body: 'فقط برای من' });
    expect(note.categoryId).toBe(mine[0]?.id);
    expectStatus(await t.http().get(`${base()}/notes/${note.id}`).set(bearer(member)), 404);
    expect(((await t.http().get(`${base()}/notes`).set(bearer(member))).body as NotePage).items).toEqual([]);
  });

  it('autosaves with If-Match and answers a stale save with the current note', async () => {
    const note = await createNote(owner, { title: 'پیش‌نویس', body: 'نسخه یک', colors: ['red', 'red', 'blue'] });
    expect(note.colors).toEqual(['red', 'blue']);
    const saved = await t.http().patch(`${base()}/notes/${note.id}`).set(bearer(owner)).set('If-Match', `"${note.version}"`).send({ body: 'نسخه دو', pinned: true });
    expectStatus(saved, 200);
    expect(saved.body).toMatchObject({ body: 'نسخه دو', pinned: true, version: note.version + 1 });
    const stale = await t.http().patch(`${base()}/notes/${note.id}`).set(bearer(owner)).set('If-Match', `"${note.version}"`).send({ body: 'دیر' });
    expectStatus(stale, 412);
    expect(stale.body.current).toMatchObject({ body: 'نسخه دو', version: note.version + 1 });
    expectStatus(await t.http().patch(`${base()}/notes/${note.id}`).set(bearer(owner)).send({ body: 'بی‌نسخه' }), 428);
  });

  it('deletes any notebook, built-ins too, keeping its notes in no notebook', async () => {
    const ideas = (await categories(owner)).find((category) => category.key === 'ideas') as NoteCategoryView;
    const idea = await createNote(owner, { categoryId: ideas.id, title: 'ایده ماندگار' });
    expectStatus(await t.http().delete(`${base()}/note-categories/${ideas.id}`).set(bearer(owner)), 204);
    // Gone for good: seeding the built-ins (on every read) does not bring it back.
    expect((await categories(owner)).map((category) => category.id)).not.toContain(ideas.id);
    expect((await categories(owner)).map((category) => category.id)).not.toContain(ideas.id);
    const kept = (await t.http().get(`${base()}/notes/${idea.id}`).set(bearer(owner))).body as NoteView;
    expect(kept).toMatchObject({ title: 'ایده ماندگار', categoryId: null, version: idea.version + 1 });

    // Its name is free for a notebook of one's own; a note can be filed there, or nowhere.
    const custom = await t.http().post(`${base()}/note-categories`).set(bearer(owner)).send({ label: ideas.label });
    expectStatus(custom, 201);
    const note = await createNote(owner, { categoryId: custom.body.id, title: 'درون دفتر' });
    const unfiled = await t.http().patch(`${base()}/notes/${note.id}`).set(bearer(owner)).set('If-Match', `"${note.version}"`).send({ categoryId: null });
    expectStatus(unfiled, 200);
    expect(unfiled.body.categoryId).toBeNull();
    const refiled = await t.http().patch(`${base()}/notes/${note.id}`).set(bearer(owner)).set('If-Match', `"${unfiled.body.version}"`).send({ categoryId: custom.body.id });
    expectStatus(refiled, 200);

    // A custom notebook holding notes goes too; the note stays.
    expectStatus(await t.http().delete(`${base()}/note-categories/${custom.body.id}`).set(bearer(owner)), 204);
    expect(((await t.http().get(`${base()}/notes/${note.id}`).set(bearer(owner))).body as NoteView).categoryId).toBeNull();
    // A deleted notebook takes no notes.
    expectStatus(await t.http().post(`${base()}/notes`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ categoryId: ideas.id, title: 'دیر' }), 400);

    // Once «شخصی» is gone, a note with no notebook named lands in none.
    const personal = (await categories(member)).find((category) => category.key === 'personal') as NoteCategoryView;
    expectStatus(await t.http().delete(`${base()}/note-categories/${personal.id}`).set(bearer(member)), 204);
    expect((await createNote(member, { title: 'بی‌دفتر' })).categoryId).toBeNull();
  });

  it('finds notes with Persian normalisation', async () => {
    const note = await createNote(owner, { title: 'جلسه با علي', body: 'درباره كتاب' });
    const found = (await t.http().get(`${base()}/notes?q=${encodeURIComponent('علی کتاب'.split(' ')[1] ?? '')}`).set(bearer(owner))).body as NotePage;
    expect(found.items.map((item) => item.id)).toContain(note.id);
  });

  it('converts a note once: open checklist items become subtasks, the rest the description', async () => {
    const note = await createNote(owner, { title: 'راه‌اندازی', body: 'مقدمه\n- [ ] خرید سرور\n- [x] انتخاب دامنه\n- [ ] نصب' });
    const convert = () =>
      t.http().post(`${base()}/notes/${note.id}/task`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ projectId: project.id, priority: 'high' });
    const [first, second] = await Promise.all([convert(), convert()]);
    expectStatus(first, 200);
    expectStatus(second, 200);
    const results = [first.body, second.body] as ConvertNoteResult[];
    expect(results.map((result) => result.existing).sort()).toEqual([false, true]);
    expect(results[0]?.task.id).toBe(results[1]?.task.id);
    const task = results[0]?.task;
    expect(task).toMatchObject({ title: 'راه‌اندازی', priority: 'high', sourceNoteId: note.id });
    expect(task?.subtasks.map((subtask) => subtask.title)).toEqual(['خرید سرور', 'نصب']);
    expect(task?.description).toContain('انتخاب دامنه');
    expect(((await t.http().get(`${base()}/notes/${note.id}`).set(bearer(owner))).body as NoteView).linkedTaskId).toBe(task?.id);
    expect((await outboxEvents(t, 'note.task_linked', note.id)).length).toBe(1);

    // Deleting the task frees the note for another conversion.
    expectStatus(await t.http().delete(`${base()}/tasks/${task?.id}`).set(bearer(owner)), 204);
    const again = await convert();
    expect(again.body).toMatchObject({ existing: false });
    expect(again.body.task.id).not.toBe(task?.id);
  });
});

describe('M2: calendar', () => {
  let t: TestApp;
  let owner: Session;
  let member: Session;
  let workspace: WorkspaceView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    member = await addMember(t, owner, workspace.id, 'member');
  });
  afterAll(async () => {
    t?.app.get(Clock).pin(null);
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const createEvent = async (as: Session, body: Record<string, unknown>) => {
    const response = await t.http().post(`${base()}/calendar/events`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send(body);
    expectStatus(response, 201);
    return response.body as CalendarEventView;
  };
  const view = async (as: Session, from: string, to: string) => {
    const response = await t.http().get(`${base()}/calendar?from=${from}&to=${to}`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as CalendarView;
  };

  it('keeps meetings on the workspace’s wall clock', async () => {
    const meeting = await createEvent(owner, { kind: 'meeting', title: 'جلسه هفتگی', date: '2026-11-03', startTime: '۰۹:۳۰', endTime: '10:15', attendeeIds: [member.userId] });
    expect(meeting).toMatchObject({ date: '2026-11-03', startTime: '09:30', endTime: '10:15', startsAt: '2026-11-03T06:00:00.000Z' });
    const november = await view(member, '2026-11-01', '2026-11-30');
    expect(november.events.map((event) => event.id)).toContain(meeting.id);
    expect(november.timeZone).toBe('Asia/Tehran');
    // A meeting at 02:00 Tehran on 1 December is 30 November in UTC, and belongs to December.
    const early = await createEvent(owner, { kind: 'meeting', title: 'زود', date: '2026-12-01', startTime: '02:00' });
    expect((await view(owner, '2026-11-01', '2026-11-30')).events.map((event) => event.id)).not.toContain(early.id);
    expect((await view(owner, '2026-12-01', '2026-12-31')).events.map((event) => event.id)).toContain(early.id);
  });

  it('shows personal events to their author and attendees only, and all-day spans across the range edge', async () => {
    const trip = await createEvent(owner, { kind: 'reminder', title: 'سفر', date: '2026-10-30', endDate: '2026-11-02' });
    expect(trip).toMatchObject({ startTime: null, endDate: '2026-11-02' });
    expect((await view(owner, '2026-11-01', '2026-11-30')).events.map((event) => event.id)).toContain(trip.id);
    expect((await view(member, '2026-11-01', '2026-11-30')).events.map((event) => event.id)).not.toContain(trip.id);
    expectStatus(await t.http().get(`${base()}/calendar/events/${trip.id}`).set(bearer(member)), 404);
    const milestoneWithTime = await t.http().post(`${base()}/calendar/events`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ kind: 'milestone', title: 'x', date: '2026-11-05', startTime: '10:00' });
    expectStatus(milestoneWithTime, 400);
  });

  it('derives deadlines from open tasks the viewer can see', async () => {
    const open = await createProject(t, owner, workspace.id);
    const secret = await createProject(t, owner, workspace.id, { visibility: 'private' });
    const due = await createTask(t, owner, workspace.id, { projectId: open.id, title: 'مهلت', startDate: '2026-11-01', dueDate: '2026-11-10' });
    const hidden = await createTask(t, owner, workspace.id, { projectId: secret.id, title: 'پنهان', startDate: '2026-11-01', dueDate: '2026-11-11' });
    const finished = await createTask(t, owner, workspace.id, { projectId: open.id, title: 'تمام', startDate: '2026-11-01', dueDate: '2026-11-12' });
    expectStatus(await t.http().post(`${base()}/tasks/${finished.id}/complete`).set(bearer(owner)).send({ completed: true }), 200);
    const seen = (await view(member, '2026-11-01', '2026-11-30')).deadlines.map((deadline) => deadline.taskId);
    expect(seen).toContain(due.id);
    expect(seen).not.toContain(hidden.id);
    expect(seen).not.toContain(finished.id);
    expect((await view(owner, '2026-11-01', '2026-11-30')).deadlines.map((deadline) => deadline.taskId)).toContain(hidden.id);
  });

  it('reschedules the reminder when an event changes; the stale reminder does nothing', async () => {
    t.app.get(Clock).pin(new Date('2026-10-01T08:00:00Z'));
    const meeting = await createEvent(owner, { kind: 'meeting', title: 'مرور', date: '2026-10-20', startTime: '10:00', attendeeIds: [member.userId] });
    const [scheduled] = await outboxEvents(t, 'calendar.event.changed', meeting.id);
    // Fifteen minutes before 10:00 Tehran.
    expect(scheduled?.payload).toMatchObject({ version: 1, remindAt: '2026-10-20T06:15:00.000Z' });
    const moved = await t.http().patch(`${base()}/calendar/events/${meeting.id}`).set(bearer(owner)).set('If-Match', `"${meeting.version}"`).send({ startTime: '11:00' });
    expectStatus(moved, 200);
    expectStatus(await t.http().patch(`${base()}/calendar/events/${meeting.id}`).set(bearer(owner)).set('If-Match', `"${meeting.version}"`).send({ title: 'x' }), 412);
    const calendar = t.app.get(CalendarService);
    expect(await calendar.remind(workspace.id, meeting.id, 1)).toBe('stale');
    // Run the jobs the relay scheduled, delayed ones included: only version 2 notifies.
    await t.flushNotifications({ delayed: true });
    const inbox = (await t.http().get('/api/v1/me/notifications').set(bearer(member))).body as NotificationPage;
    const reminders = inbox.items.filter((item) => item.kind === 'event-reminder' && item.targetId === meeting.id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.subject).toBe('مرور');
    t.app.get(Clock).pin(null);
  });
});

describe('M2: notifications and the activity feed', () => {
  let t: TestApp;
  let owner: Session;
  let member: Session;
  let other: Session;
  let workspace: WorkspaceView;
  let project: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    member = await addMember(t, owner, workspace.id, 'member');
    other = await addMember(t, owner, workspace.id, 'member');
    project = await createProject(t, owner, workspace.id);
    await t.flushNotifications();
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const inbox = async (as: Session, query = '') => {
    const response = await t.http().get(`/api/v1/me/notifications${query}`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as NotificationPage;
  };
  const activity = async (as: Session) => ((await t.http().get(`${base()}/activity`).set(bearer(as))).body as ActivityPage).items;

  it('tells new assignees, and records it in the feed', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'بررسی قرارداد', assigneeIds: [member.userId, owner.userId] });
    await t.flushNotifications();
    const page = await inbox(member);
    expect(page.items[0]).toMatchObject({ kind: 'task-assigned', subject: 'بررسی قرارداد', targetType: 'task', targetId: task.id, actorId: owner.userId, read: false });
    expect(page.unreadCount).toBe(1);
    // Nobody is told about what they did themselves.
    expect((await inbox(owner)).items.filter((item) => item.targetId === task.id)).toEqual([]);
    expect((await activity(other)).find((entry) => entry.targetId === task.id)).toMatchObject({ kind: 'task-assigned', actorId: owner.userId });
  });

  it('collapses a card dragged around into one unread status notification', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'جابه‌جایی' });
    const columns = (await getWorkflow(t, owner, workspace.id, project.id)).columns;
    let card: TaskCard = task;
    for (const status of ['in-progress', 'review', 'done'] as const) {
      const column = columns.find((entry) => entry.status === status);
      const response = await t.http().post(`${base()}/tasks/${task.id}/move`).set(bearer(member)).send({ columnId: column?.id, expectedVersion: card.version });
      expectStatus(response, 200);
      card = response.body as TaskCard;
      await t.flushNotifications();
    }
    const statuses = (await inbox(owner)).items.filter((item) => item.targetId === task.id && item.kind === 'status-changed');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.payload).toMatchObject({ from: 'review', to: 'done' });
    expect((await activity(owner)).filter((entry) => entry.targetId === task.id && entry.kind === 'task-completed')).toHaveLength(1);
  });

  it('turns replies into reply notifications for the parent’s author', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'گفت‌وگو', assigneeIds: [other.userId] });
    const parent = await t.http().post(`${base()}/tasks/${task.id}/comments`).set(bearer(member)).send({ body: 'سؤال دارم' });
    await t.http().post(`${base()}/tasks/${task.id}/comments`).set(bearer(owner)).send({ body: 'پاسخ مالک', replyToId: parent.body.id });
    await t.flushNotifications();
    expect((await inbox(member, '?filter=mentions')).items.find((item) => item.targetId === task.id)).toMatchObject({ kind: 'reply', payload: expect.objectContaining({ excerpt: 'پاسخ مالک' }) });
    expect((await inbox(other)).items.filter((item) => item.targetId === task.id).map((item) => item.kind).sort()).toEqual(['comment', 'comment', 'task-assigned']);
  });

  it('never writes an event twice, however often the worker sees it', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'تکرار', assigneeIds: [member.userId] });
    const { rows } = await t.admin.query<{ id: number; payload: Record<string, unknown>; headers: Record<string, string>; workspace_id: string }>(
      `select id, payload, headers, workspace_id from outbox_events where event_type = 'task.assigned' and aggregate_id = $1`,
      [task.id],
    );
    const event = rows[0];
    if (!event) throw new Error('no task.assigned event');
    const job = { eventId: Number(event.id), workspaceId: event.workspace_id, type: 'task.assigned', actorId: event.headers.actorId ?? null, payload: event.payload };
    const feed = t.app.get(FeedService);
    await feed.fanout(job);
    await feed.fanout(job);
    const counts = await t.admin.query(
      `select (select count(*)::int from notifications where target_id = $1) as notifications, (select count(*)::int from activity_events where target_id = $1) as activity`,
      [task.id],
    );
    expect(counts.rows[0]).toEqual({ notifications: 1, activity: 1 });
  });

  it('marks notifications read, by id and all at once', async () => {
    const before = await inbox(member);
    expect(before.unreadCount).toBeGreaterThan(1);
    const first = before.items.find((item) => !item.read);
    const one = await t.http().post('/api/v1/me/notifications/read').set(bearer(member)).send({ ids: [first?.id] });
    expect(one.body).toEqual({ marked: 1 });
    expect((await inbox(member)).unreadCount).toBe(before.unreadCount - 1);
    const all = await t.http().post('/api/v1/me/notifications/read').set(bearer(member)).send({ all: true, workspaceId: workspace.id });
    expectStatus(all, 200);
    const after = await inbox(member);
    expect({ unread: after.unreadCount, left: after.items.filter((item) => !item.read) }).toEqual({ unread: 0, left: [] });
    expect((await inbox(member, '?filter=unread')).items).toEqual([]);
  });

  it('keeps private projects out of other people’s feed', async () => {
    const secret = await createProject(t, owner, workspace.id, { visibility: 'private' });
    const task = await createTask(t, owner, workspace.id, { projectId: secret.id, title: 'محرمانه', assigneeIds: [owner.userId] });
    await t.http().post(`${base()}/tasks/${task.id}/comments`).set(bearer(owner)).send({ body: 'یادداشت درونی' });
    await t.flushNotifications();
    expect((await activity(owner)).some((entry) => entry.targetId === task.id)).toBe(true);
    expect((await activity(member)).some((entry) => entry.targetId === task.id)).toBe(false);
  });
});

describe('M2 checklist: reports on the Jalali calendar', () => {
  let t: TestApp;
  let owner: Session;
  let guest: Session;
  let workspace: WorkspaceView;
  let project: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    guest = await addMember(t, owner, workspace.id, 'guest');
    project = await createProject(t, owner, workspace.id);
  });
  afterAll(async () => {
    await t?.close();
  });

  const report = async (jalaliYear: number) => {
    const response = await t.http().get(`${wsPath(workspace.id)}/reports/tasks-by-month?jalaliYear=${jalaliYear}`).set(bearer(owner));
    expectStatus(response, 200);
    return response.body as MonthlyTaskReport;
  };
  const taskAt = async (createdAt: string, completedAt?: string) => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, startDate: '2024-01-01' });
    if (completedAt) expectStatus(await t.http().post(`${wsPath(workspace.id)}/tasks/${task.id}/complete`).set(bearer(owner)).send({ completed: true }), 200);
    await t.admin.query('update tasks set created_at = $2, completed_at = coalesce($3, completed_at) where id = $1', [task.id, createdAt, completedAt ?? null]);
  };

  it('counts by the Tehran date: 00:30 on Nowruz is Farvardin, not the previous Esfand', async () => {
    // 1 Farvardin 1405 is 21 March 2026; 00:30 that night in Tehran is 20 March 21:00 UTC.
    const nowruz = jalaliToGregorian(1405, 1, 1);
    expect([nowruz.getFullYear(), nowruz.getMonth() + 1, nowruz.getDate()]).toEqual([2026, 3, 21]);
    await taskAt('2026-03-20T21:00:00Z');
    const year1405 = await report(1405);
    expect(year1405.months[0]).toMatchObject({ month: 1, name: 'فروردین', created: 1 });
    expect((await report(1404)).months[11]?.created).toBe(0);
  });

  it('puts Esfand 30 of a leap year in Esfand', async () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    const esfand30 = jalaliToGregorian(1403, 12, 30);
    const iso = `${esfand30.getFullYear()}-${String(esfand30.getMonth() + 1).padStart(2, '0')}-${String(esfand30.getDate()).padStart(2, '0')}`;
    expect(gregorianToJalali(esfand30)).toEqual({ year: 1403, month: 12, day: 30 });
    // Noon in Tehran on Esfand 30.
    await taskAt(`${iso}T08:30:00Z`, `${iso}T08:30:00Z`);
    const months = (await report(1403)).months;
    expect(months[11]).toMatchObject({ month: 12, name: 'اسفند', created: 1, completed: 1 });
    expect(months.reduce((sum, month) => sum + month.created, 0)).toBe(1);
  });

  it('is for roles that hold reports:view', async () => {
    expectStatus(await t.http().get(`${wsPath(workspace.id)}/reports/tasks-by-month?jalaliYear=1405`).set(bearer(guest)), 403);
  });
});
