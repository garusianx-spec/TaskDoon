import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardView, ProjectView, TaskDependencyView, TaskDetail, TaskPage, WorklogList, WorklogView, WorkspaceView } from '@taskin/contracts';
import { ProjectsService } from '../../src/modules/work/projects.service.js';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createProject, createTask, expectStatus, outboxEvents, putProjectMember, usePlan, wsPath } from './work-helpers.js';

describe('Agile tracking: issue types, backlog, worklogs and dependencies', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let member: Session;
  let viewer: Session;
  let project: ProjectView;
  let other: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    member = await addMember(t, owner, workspace.id, 'member');
    viewer = await addMember(t, owner, workspace.id, 'member');
    project = await createProject(t, owner, workspace.id, { name: 'چابک' });
    other = await createProject(t, owner, workspace.id, { name: 'دیگری' });
    await putProjectMember(t, owner, workspace.id, project.id, viewer.userId, 'viewer');
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const taskPath = (task: { id: string }, projectId = project.id) => `${base()}/projects/${projectId}/tasks/${task.id}`;
  const get = async <T>(as: Session, path: string): Promise<T> => {
    const response = await t.http().get(path).set(bearer(as));
    expectStatus(response, 200);
    return response.body as T;
  };
  const detail = (as: Session, id: string) => get<TaskDetail>(as, `${base()}/tasks/${id}`);
  const patch = async (as: Session, task: TaskDetail, body: Record<string, unknown>) =>
    t.http().patch(`${base()}/tasks/${task.id}`).set(bearer(as)).set('If-Match', `"${task.version}"`).send(body);
  const logWork = (as: Session, task: { id: string }, body: Record<string, unknown>, projectId = project.id) =>
    t.http().post(`${taskPath(task, projectId)}/worklogs`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send(body);
  const link = (as: Session, task: { id: string }, targetTaskId: string, type: string, projectId = project.id) =>
    t.http().post(`${taskPath(task, projectId)}/dependencies`).set(bearer(as)).send({ targetTaskId, type });

  /* ------------------------------------------------------------------ issue types and backlog */

  it('makes every task a plain board task unless told otherwise', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'پیش‌فرض' });
    expect(task).toMatchObject({ type: 'task', severity: null, estimatedMinutes: null, spentMinutes: 0, isBacklog: false, blockedByIds: [] });
    const { rows } = await t.admin.query<{ type: string; severity: string | null; is_backlog: boolean }>('select type, severity, is_backlog from tasks where id = $1', [task.id]);
    expect(rows[0]).toEqual({ type: 'task', severity: null, is_backlog: false });
  });

  it('creates bugs with a severity and features, and keeps severity to bugs', async () => {
    const bug = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'خطای ورود', type: 'bug', severity: 'critical', estimatedMinutes: 90 });
    expect(bug).toMatchObject({ type: 'bug', severity: 'critical', estimatedMinutes: 90 });
    const feature = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'ویژگی تازه', type: 'feature' });
    expect(feature).toMatchObject({ type: 'feature', severity: null });

    const refused = await t
      .http()
      .post(`${base()}/tasks`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ projectId: project.id, title: 'x', type: 'feature', severity: 'high' });
    expectStatus(refused, 400);
    expect(refused.body.errors).toEqual([{ field: 'severity', message: 'is for bugs only' }]);
    const bogus = await t.http().post(`${base()}/tasks`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ projectId: project.id, title: 'x', type: 'epic' });
    expectStatus(bogus, 400);
    for (const estimatedMinutes of [0, 60001, 1.5]) {
      const outOfRange = await t
        .http()
        .post(`${base()}/tasks`)
        .set(bearer(owner))
        .set('Idempotency-Key', idempotencyKey())
        .send({ projectId: project.id, title: 'x', estimatedMinutes });
      expectStatus(outOfRange, 400);
    }
  });

  it('changes type, severity and estimate with edit, and clears the severity when a bug stops being one', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'تغییر نوع' });
    const asBug = await patch(member, task, { type: 'bug', severity: 'high', estimatedMinutes: 120 });
    expectStatus(asBug, 200);
    expect(asBug.body).toMatchObject({ type: 'bug', severity: 'high', estimatedMinutes: 120, version: task.version + 1 });
    const updated = (await outboxEvents(t, 'task.updated', task.id)).at(-1)?.payload;
    expect(updated).toMatchObject({ fields: ['type', 'severity', 'estimatedMinutes'] });

    const severityOnTask = await patch(member, asBug.body as TaskDetail, { type: 'task', severity: 'low' });
    expectStatus(severityOnTask, 400);
    const asTask = await patch(member, asBug.body as TaskDetail, { type: 'task' });
    expectStatus(asTask, 200);
    expect(asTask.body).toMatchObject({ type: 'task', severity: null, estimatedMinutes: 120 });
    const cleared = await patch(member, asTask.body as TaskDetail, { estimatedMinutes: null });
    expect(cleared.body).toMatchObject({ estimatedMinutes: null });

    const audit = await t.admin.query<{ changes: { before: Record<string, unknown> } }>(
      `select changes from audit_logs where action = 'task.update' and resource_id = $1 order by id desc limit 1`,
      [task.id],
    );
    expect(audit.rows[0]?.changes.before).toMatchObject({ estimatedMinutes: 120 });

    expectStatus(await patch(viewer, cleared.body as TaskDetail, { type: 'feature' }), 403);
  });

  it('keeps backlog items off the board, lists them on request and moves them back', async () => {
    const onBoard = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'روی بورد' });
    const queued = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'در بک‌لاگ', isBacklog: true });
    expect(queued.isBacklog).toBe(true);

    const board = await get<BoardView>(owner, `${base()}/board?projectId=${project.id}`);
    expect(board.tasks.some((card) => card.id === onBoard.id)).toBe(true);
    expect(board.tasks.some((card) => card.id === queued.id)).toBe(false);

    const all = await get<TaskPage>(owner, `${base()}/tasks?projectId=${project.id}&limit=200`);
    expect(all.items.find((card) => card.id === queued.id)?.isBacklog).toBe(true);
    const backlog = await get<TaskPage>(owner, `${base()}/tasks?projectId=${project.id}&backlog=true&limit=200`);
    expect(backlog.items.map((card) => card.id)).toEqual([queued.id]);
    const boardOnly = await get<TaskPage>(owner, `${base()}/tasks?projectId=${project.id}&backlog=false&limit=200`);
    expect(boardOnly.items.some((card) => card.id === queued.id)).toBe(false);
    expectStatus(await t.http().get(`${base()}/tasks?backlog=maybe`).set(bearer(owner)), 400);

    // Placement needs `assign`, like a move: a viewer may not; a contributor may.
    expectStatus(await patch(viewer, queued, { isBacklog: false }), 403);
    const moved = await patch(member, queued, { isBacklog: false });
    expectStatus(moved, 200);
    expect(moved.body).toMatchObject({ isBacklog: false, columnId: queued.columnId, position: queued.position });
    const after = await get<BoardView>(owner, `${base()}/board?projectId=${project.id}`);
    expect(after.tasks.some((card) => card.id === queued.id)).toBe(true);
  });

  /* ------------------------------------------------------------------ worklogs */

  it('logs time, totals it on the card and lists it newest first', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'زمان‌سنجی', estimatedMinutes: 120 });
    const first = await logWork(member, task, { durationMinutes: 90, description: '  بررسی اولیه  ', loggedAt: '2026-01-10T08:00:00.000Z' });
    expectStatus(first, 201);
    expect(first.body).toMatchObject({ taskId: task.id, userId: member.userId, durationMinutes: 90, description: 'بررسی اولیه', loggedAt: '2026-01-10T08:00:00.000Z' });
    expectStatus(await logWork(owner, task, { durationMinutes: 45 }), 201);

    const list = await get<WorklogList>(owner, `${taskPath(task)}/worklogs`);
    expect(list.totalMinutes).toBe(135);
    expect(list.estimatedMinutes).toBe(120);
    expect(list.items.map((entry) => entry.durationMinutes)).toEqual([45, 90]);
    expect((await detail(owner, task.id)).spentMinutes).toBe(135);
    const card = (await get<TaskPage>(owner, `${base()}/tasks?projectId=${project.id}&limit=200`)).items.find((entry) => entry.id === task.id);
    expect(card?.spentMinutes).toBe(135);
    // Worklogs keep the task's version, and tell its viewers anyway.
    expect((await detail(owner, task.id)).version).toBe(task.version);
    expect((await outboxEvents(t, 'task.updated', task.id)).at(-1)?.payload).toMatchObject({ fields: ['worklogs'], version: task.version });
    const audit = await t.admin.query<{ n: string }>(`select count(*) as n from audit_logs where action = 'task.worklog.create' and resource_id = $1`, [task.id]);
    expect(Number(audit.rows[0]?.n)).toBe(2);
  });

  it('validates worklogs and checks who may log and remove them', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'قواعد زمان' });
    for (const body of [{ durationMinutes: 0 }, { durationMinutes: 1441 }, { durationMinutes: 30, description: 'x'.repeat(501) }, { durationMinutes: 30, loggedAt: 'yesterday' }]) {
      expectStatus(await logWork(owner, task, body), 400);
    }
    expectStatus(await logWork(owner, task, { durationMinutes: 30, loggedAt: '2099-01-01T00:00:00.000Z' }), 400);
    expectStatus(await logWork(viewer, task, { durationMinutes: 30 }), 403);
    expect((await get<WorklogList>(viewer, `${taskPath(task)}/worklogs`)).items).toEqual([]);

    const mine = (await logWork(member, task, { durationMinutes: 20 })).body as WorklogView;
    const owners = (await logWork(owner, task, { durationMinutes: 10 })).body as WorklogView;
    // A contributor removes their own time but not someone else's.
    expectStatus(await t.http().delete(`${taskPath(task)}/worklogs/${owners.id}`).set(bearer(member)), 403);
    expectStatus(await t.http().delete(`${taskPath(task)}/worklogs/${mine.id}`).set(bearer(member)), 204);
    expectStatus(await t.http().delete(`${taskPath(task)}/worklogs/${mine.id}`).set(bearer(member)), 404);
    expectStatus(await t.http().delete(`${taskPath(task)}/worklogs/${owners.id}`).set(bearer(owner)), 204);
    expect((await get<WorklogList>(owner, `${taskPath(task)}/worklogs`)).totalMinutes).toBe(0);
  });

  it('answers 404 for a task addressed through the wrong project, a deleted task or an invisible project', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'مسیر' });
    expectStatus(await t.http().get(`${taskPath(task, other.id)}/worklogs`).set(bearer(owner)), 404);
    expectStatus(await logWork(owner, task, { durationMinutes: 5 }, other.id), 404);
    const secret = await createProject(t, owner, workspace.id, { name: 'محرمانه', visibility: 'private' });
    const hidden = await createTask(t, owner, workspace.id, { projectId: secret.id, title: 'پنهان' });
    expectStatus(await t.http().get(`${taskPath(hidden, secret.id)}/worklogs`).set(bearer(member)), 404);
    expectStatus(await t.http().get(`${taskPath(hidden, secret.id)}/dependencies`).set(bearer(member)), 404);
    expectStatus(await t.http().delete(`${base()}/tasks/${task.id}`).set(bearer(owner)), 204);
    expectStatus(await t.http().get(`${taskPath(task)}/worklogs`).set(bearer(owner)), 404);
  });

  /* ------------------------------------------------------------------ dependencies */

  it('links tasks, shows each link from both sides and reports blockers on cards', async () => {
    const api = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'API' });
    const ui = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'رابط کاربری' });
    const docs = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'مستندات' });

    const blocks = await link(member, api, ui.id, 'blocks');
    expectStatus(blocks, 201);
    expect(blocks.body).toMatchObject({ type: 'blocks', task: { id: ui.id, code: ui.code, title: 'رابط کاربری', status: 'todo' } });
    // `docs blocked_by ui` is the edge `ui blocks docs`.
    expectStatus(await link(member, docs, ui.id, 'blocked_by'), 201);
    expectStatus(await link(member, api, docs.id, 'relates_to'), 201);

    const fromUi = await get<TaskDependencyView[]>(owner, `${taskPath(ui)}/dependencies`);
    expect(fromUi.map((entry) => [entry.task.id, entry.type])).toEqual([
      [api.id, 'blocked_by'],
      [docs.id, 'blocks'],
    ]);
    const fromApi = await get<TaskDependencyView[]>(viewer, `${taskPath(api)}/dependencies`);
    expect(fromApi.map((entry) => [entry.task.id, entry.type])).toEqual([
      [ui.id, 'blocks'],
      [docs.id, 'relates_to'],
    ]);

    expect((await detail(owner, ui.id)).blockedByIds).toEqual([api.id]);
    expect((await detail(owner, docs.id)).blockedByIds).toEqual([ui.id]);
    expect((await detail(owner, api.id)).blockedByIds).toEqual([]);
    const board = await get<BoardView>(owner, `${base()}/board?projectId=${project.id}`);
    expect(board.tasks.find((card) => card.id === docs.id)?.blockedByIds).toEqual([ui.id]);

    // Both ends hear about the link; neither version moves.
    expect((await outboxEvents(t, 'task.updated', ui.id)).at(-1)?.payload).toMatchObject({ fields: ['dependencies'], version: ui.version });
    expect((await outboxEvents(t, 'task.updated', api.id)).at(-1)?.payload).toMatchObject({ fields: ['dependencies'] });

    // A blocker that is done still counts as a link; clients read its status. Archived or deleted ones do not.
    expectStatus(await t.http().post(`${base()}/tasks/${api.id}/complete`).set(bearer(owner)).send({ completed: true }), 200);
    expect((await detail(owner, ui.id)).blockedByIds).toEqual([api.id]);
    expectStatus(await t.http().delete(`${base()}/tasks/${api.id}`).set(bearer(owner)), 204);
    expect((await detail(owner, ui.id)).blockedByIds).toEqual([]);
    expect((await get<TaskDependencyView[]>(owner, `${taskPath(ui)}/dependencies`)).map((entry) => entry.task.id)).toEqual([docs.id]);
  });

  it('refuses self links, duplicates either way, other projects and viewers', async () => {
    const a = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'الف' });
    const b = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'ب' });
    const elsewhere = await createTask(t, owner, workspace.id, { projectId: other.id, title: 'پروژه دیگر' });

    expectStatus(await link(owner, a, a.id, 'blocks'), 400);
    expectStatus(await link(owner, a, b.id, 'sideways'), 400);
    expectStatus(await link(owner, a, b.id, 'relates_to'), 201);
    const again = await link(owner, b, a.id, 'blocks');
    expectStatus(again, 409);
    expect(again.body.code).toBe('DEPENDENCY_EXISTS');
    const cross = await link(owner, a, elsewhere.id, 'blocks');
    expectStatus(cross, 422);
    expect(cross.body.code).toBe('DEPENDENCY_CROSS_PROJECT');
    expectStatus(await link(owner, a, '00000000-0000-7000-8000-000000000000', 'blocks'), 404);
    expectStatus(await link(viewer, a, b.id, 'blocks'), 403);
  });

  it('prevents blocking cycles, direct and through other tasks, whichever way they are written', async () => {
    const [a, b, c, d] = await Promise.all(['یک', 'دو', 'سه', 'چهار'].map((title) => createTask(t, owner, workspace.id, { projectId: project.id, title })));
    if (!a || !b || !c || !d) throw new Error('tasks missing');
    expectStatus(await link(owner, a, b.id, 'blocks'), 201); // a → b
    expectStatus(await link(owner, c, b.id, 'blocked_by'), 201); // b → c
    const direct = await link(owner, b, a.id, 'blocks'); // b → a closes a ↔ b
    expectStatus(direct, 409);
    expect(direct.body.code).toBe('DEPENDENCY_EXISTS'); // the pair is already linked
    const transitive = await link(owner, c, a.id, 'blocks'); // c → a closes a → b → c → a
    expectStatus(transitive, 409);
    expect(transitive.body.code).toBe('DEPENDENCY_CYCLE');
    const reversed = await link(owner, a, c.id, 'blocked_by'); // the same edge, written the other way
    expect(reversed.body.code).toBe('DEPENDENCY_CYCLE');
    // Non-blocking links and blocking links that go the same way are fine.
    expectStatus(await link(owner, c, a.id, 'relates_to'), 201);
    expectStatus(await link(owner, a, d.id, 'blocks'), 201);
    expectStatus(await link(owner, c, d.id, 'blocks'), 201);
  });

  it('lets only one of two opposite links racing each other through', async () => {
    const a = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'مسابقه الف' });
    const b = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'مسابقه ب' });
    const c = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'مسابقه ج' });
    expectStatus(await link(owner, a, b.id, 'blocks'), 201);
    // b → c and c → a would each be fine alone; together they close a cycle.
    const results = await Promise.all([link(owner, b, c.id, 'blocks'), link(member, c, a.id, 'blocks')]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
  });

  it('unlinks from either end and tells both tasks', async () => {
    const a = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'قطع الف' });
    const b = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'قطع ب' });
    const created = (await link(owner, a, b.id, 'blocks')).body as TaskDependencyView;
    expectStatus(await t.http().delete(`${taskPath(a)}/dependencies/${created.id}`).set(bearer(viewer)), 403);
    const unrelated = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'بی‌ربط' });
    expectStatus(await t.http().delete(`${taskPath(unrelated)}/dependencies/${created.id}`).set(bearer(owner)), 404);
    expectStatus(await t.http().delete(`${taskPath(b)}/dependencies/${created.id}`).set(bearer(member)), 204);
    expect((await detail(owner, b.id)).blockedByIds).toEqual([]);
    expect(await get<TaskDependencyView[]>(owner, `${taskPath(a)}/dependencies`)).toEqual([]);
    expect((await outboxEvents(t, 'task.updated', a.id)).at(-1)?.payload).toMatchObject({ fields: ['dependencies'] });
    const audit = await t.admin.query<{ n: string }>(`select count(*) as n from audit_logs where action = 'task.dependency.delete' and resource_id = $1`, [b.id]);
    expect(Number(audit.rows[0]?.n)).toBe(1);
  });

  it('keeps each workspace to its own worklogs and links', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'مرز' });
    const peer = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'مرز ۲' });
    expectStatus(await logWork(owner, task, { durationMinutes: 15 }), 201);
    expectStatus(await link(owner, task, peer.id, 'blocks'), 201);
    const stranger = await ownerWithWorkspace(t, 'فضای دیگر');
    expectStatus(await t.http().get(`${taskPath(task)}/worklogs`).set(bearer(stranger.owner)), 404);
    const theirs = await createProject(t, stranger.owner, stranger.workspace.id, { name: 'بیگانه' });
    // Their project path with our task id: the task does not exist for them.
    const foreign = await t.http().get(`${wsPath(stranger.workspace.id)}/projects/${theirs.id}/tasks/${task.id}/worklogs`).set(bearer(stranger.owner));
    expectStatus(foreign, 404);
    const counts = await t.admin.query<{ w: string; d: string }>(
      `select (select count(*) from task_worklogs where workspace_id = $1) as w, (select count(*) from task_dependencies where workspace_id = $1) as d`,
      [stranger.workspace.id],
    );
    expect(counts.rows[0]).toEqual({ w: '0', d: '0' });
  });

  it('removes worklogs and links with their tasks when a project is purged', async () => {
    const doomed = await createProject(t, owner, workspace.id, { name: 'پاک‌شدنی' });
    const a = await createTask(t, owner, workspace.id, { projectId: doomed.id, title: 'پاک ۱' });
    const b = await createTask(t, owner, workspace.id, { projectId: doomed.id, title: 'پاک ۲' });
    expectStatus(await logWork(owner, a, { durationMinutes: 30 }, doomed.id), 201);
    expectStatus(await link(owner, a, b.id, 'blocks', doomed.id), 201);
    expectStatus(await t.http().delete(`${base()}/projects/${doomed.id}`).set(bearer(owner)), 204);
    await t.admin.query(`update projects set deleted_at = now() - interval '41 days' where id = $1`, [doomed.id]);
    expect(await t.app.get(ProjectsService).purgeDue()).toBeGreaterThanOrEqual(1);
    const left = await t.admin.query<{ w: string; d: string }>(
      `select (select count(*) from task_worklogs where task_id = any($1::uuid[])) as w, (select count(*) from task_dependencies where project_id = $2) as d`,
      [[a.id, b.id], doomed.id],
    );
    expect(left.rows[0]).toEqual({ w: '0', d: '0' });
  });
});
