import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CalendarView,
  CalendarEventView,
  ConvertMessageResult,
  ConvertNoteResult,
  NoteView,
  ProjectView,
  WorkspaceView,
} from '@taskin/contracts';
import {
  bearer,
  createTestApp,
  idempotencyKey,
  ownerWithWorkspace,
  type Session,
  type TestApp,
} from './harness.js';
import { createConversation, sendRest } from './chat-helpers.js';
import { createProject, createTask, expectStatus, wsPath } from './work-helpers.js';

describe('task composer start dates across conversion routes', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let project: ProjectView;
  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    project = await createProject(t, owner, workspace.id);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('persists an empty deadline and only lists dated tasks in the calendar range', async () => {
    const base = wsPath(workspace.id);
    const startDate = '2026-08-02';
    const dueDate = '2026-08-06';
    const undated = await createTask(t, owner, workspace.id, {
      projectId: project.id,
      startDate,
      dueDate: null,
    });
    const dated = await createTask(t, owner, workspace.id, { projectId: project.id, startDate, dueDate });
    expect(undated.dueDate).toBeNull();

    const read = await t.http().get(`${base}/tasks/${undated.id}`).set(bearer(owner));
    expectStatus(read, 200);
    expect(read.body).toMatchObject({ startDate, dueDate: null });
    const list = await t.http().get(`${base}/tasks?projectId=${project.id}`).set(bearer(owner));
    expectStatus(list, 200);
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: undated.id, dueDate: null }),
        expect.objectContaining({ id: dated.id, dueDate }),
      ]),
    );
    const calendar = await t
      .http()
      .get(`${base}/calendar?from=${startDate}&to=${dueDate}`)
      .set(bearer(owner));
    expectStatus(calendar, 200);
    expect((calendar.body as CalendarView).deadlines.map((entry) => entry.taskId)).toEqual([dated.id]);
  });

  it('returns the same stored calendar event when the original response is retried', async () => {
    const base = wsPath(workspace.id);
    const key = idempotencyKey();
    const date = '2026-09-14';
    const body = { kind: 'reminder', title: 'Retry a calendar submission', date, startTime: '10:00' };
    const submit = () =>
      t.http().post(`${base}/calendar/events`).set(bearer(owner)).set('Idempotency-Key', key).send(body);
    const first = await submit();
    expectStatus(first, 201);
    const replay = await submit();
    expectStatus(replay, 201);
    expect((replay.body as CalendarEventView).id).toBe((first.body as CalendarEventView).id);
    const calendar = await t.http().get(`${base}/calendar?from=${date}&to=${date}`).set(bearer(owner));
    expectStatus(calendar, 200);
    expect((calendar.body as CalendarView).events.filter((event) => event.title === body.title)).toHaveLength(
      1,
    );
  });

  it('creates and replays a message conversion with its chosen historical start and due dates', async () => {
    const group = await createConversation(t, owner, workspace.id, {
      kind: 'group',
      title: 'Task dates',
      memberIds: [],
    });
    const message = await sendRest(t, owner, workspace.id, group.id, { text: 'Follow up this decision' });
    const path = `${wsPath(workspace.id)}/conversations/${group.id}/messages/${message.id}/task`;
    const convert = () =>
      t.http().post(path).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({
        projectId: project.id,
        title: 'Historical follow up',
        startDate: '2024-02-28',
        dueDate: '2024-02-29',
      });
    const created = await convert();
    expectStatus(created, 201);
    const first = created.body as ConvertMessageResult;
    expect(first.task).toMatchObject({
      startDate: '2024-02-28',
      dueDate: '2024-02-29',
      sourceMessageId: message.id,
    });
    const again = await convert();
    expectStatus(again, 200);
    expect((again.body as ConvertMessageResult).task.id).toBe(first.task.id);
    expect((again.body as ConvertMessageResult).existing).toBe(true);
  });

  it('validates note start dates and retains the selected date in its conversion transaction', async () => {
    const created = await t
      .http()
      .post(`${wsPath(workspace.id)}/notes`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ title: 'Historical note', body: 'An earlier request' });
    expectStatus(created, 201);
    const note = created.body as NoteView;
    const path = `${wsPath(workspace.id)}/notes/${note.id}/task`;
    const convert = (startDate: string, dueDate: string) =>
      t
        .http()
        .post(path)
        .set(bearer(owner))
        .set('Idempotency-Key', idempotencyKey())
        .send({ projectId: project.id, startDate, dueDate });
    expectStatus(await convert('2024-02-30', '2024-03-01'), 400);
    expectStatus(await convert('2024-03-01', '2024-02-29'), 400);
    const response = await convert('2024-02-28', '2024-02-29');
    expectStatus(response, 200);
    const converted = response.body as ConvertNoteResult;
    expect(converted.task).toMatchObject({
      startDate: '2024-02-28',
      dueDate: '2024-02-29',
      sourceNoteId: note.id,
    });
    const again = await convert('2024-02-28', '2024-02-29');
    expectStatus(again, 200);
    expect((again.body as ConvertNoteResult).task.id).toBe(converted.task.id);
    expect((again.body as ConvertNoteResult).existing).toBe(true);
  });
});
