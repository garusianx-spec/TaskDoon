import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoardView, ColumnView, ProjectView, TaskCard, WorkflowView, WorkspaceView } from '@taskin/contracts';
import { bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createProject, createTask, expectStatus, getWorkflow, outboxEvents, usePlan, wsPath } from './work-helpers.js';

describe('M2 checklist: board columns and moves', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let project: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    project = await createProject(t, owner, workspace.id, { key: 'BRD', name: 'تابلو' });
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const board = async (projectId = project.id) => {
    const response = await t.http().get(`${base()}/board?projectId=${projectId}`).set(bearer(owner));
    expectStatus(response, 200);
    return response.body as BoardView;
  };
  const addColumn = async (title: string, extra: Record<string, unknown> = {}) => {
    const response = await t.http().post(`${base()}/workflow/columns`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ projectId: project.id, title, ...extra });
    expectStatus(response, 201);
    return (response.body as WorkflowView).columns.find((column) => column.title === title) as ColumnView;
  };
  const move = (task: TaskCard, columnId: string, extra: Record<string, unknown> = {}) =>
    t.http().post(`${base()}/tasks/${task.id}/move`).set(bearer(owner)).send({ columnId, expectedVersion: task.version, ...extra });
  const inColumn = (view: BoardView, columnId: string) => view.tasks.filter((task) => task.columnId === columnId).sort((a, b) => (a.position < b.position ? -1 : 1));

  it('starts every project with its own four built-in columns', async () => {
    const workflow = await getWorkflow(t, owner, workspace.id, project.id);
    expect(workflow.columns.map((column) => [column.status, column.builtIn])).toEqual([
      ['todo', true],
      ['in-progress', true],
      ['review', true],
      ['done', true],
    ]);
  });

  it('adds, renames, recolours and reorders columns, bumping the workflow version', async () => {
    const before = await getWorkflow(t, owner, workspace.id, project.id);
    const qa = await addColumn('تست کیفیت', { tone: 'violet', afterColumnId: before.columns[1]?.id });
    let workflow = await getWorkflow(t, owner, workspace.id, project.id);
    expect(workflow.version).toBe(before.version + 1);
    expect(workflow.columns.map((column) => column.id).indexOf(qa.id)).toBe(2);
    expect(qa).toMatchObject({ status: 'in-progress', tone: 'violet', builtIn: false });

    const renamed = await t.http().patch(`${base()}/workflow/columns/${qa.id}`).set(bearer(owner)).send({ title: 'QA', tone: 'red', afterColumnId: null });
    expectStatus(renamed, 200);
    workflow = renamed.body as WorkflowView;
    expect(workflow.columns[0]).toMatchObject({ id: qa.id, title: 'QA', tone: 'red' });
    const duplicate = await t.http().post(`${base()}/workflow/columns`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ projectId: project.id, title: 'qa' });
    expectStatus(duplicate, 409);
    expect((await outboxEvents(t, 'board.column.updated')).length).toBeGreaterThan(0);
  });

  it('deletes an empty column at once, and refuses the last to-do or done column', async () => {
    const empty = await addColumn('موقت');
    expectStatus(await t.http().delete(`${base()}/workflow/columns/${empty.id}`).set(bearer(owner)).send({}), 204);
    const workflow = await getWorkflow(t, owner, workspace.id, project.id);
    expect(workflow.columns.map((column) => column.id)).not.toContain(empty.id);
    const done = workflow.columns.find((column) => column.status === 'done') as ColumnView;
    const refused = await t.http().delete(`${base()}/workflow/columns/${done.id}`).set(bearer(owner)).send({});
    expectStatus(refused, 409);
    expect(refused.body.code).toBe('WORKFLOW_CATEGORY_REQUIRED');
  });

  it('migrates a deleted column’s cards, in order, taking the target’s status; or archives them', async () => {
    const staging = await addColumn('صف انتشار');
    const cards: TaskCard[] = [];
    for (let index = 0; index < 3; index += 1) {
      const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: `انتشار ${index}` });
      const moved = await move(task, staging.id);
      expectStatus(moved, 200);
      cards.push(moved.body as TaskCard);
    }
    const needsDisposition = await t.http().delete(`${base()}/workflow/columns/${staging.id}`).set(bearer(owner)).send({});
    expectStatus(needsDisposition, 409);

    const done = (await getWorkflow(t, owner, workspace.id, project.id)).columns.find((column) => column.status === 'done') as ColumnView;
    const migrate = await t.http().delete(`${base()}/workflow/columns/${staging.id}`).set(bearer(owner)).send({ disposition: { kind: 'migrate', targetColumnId: done.id } });
    expectStatus(migrate, 204);
    const after = inColumn(await board(), done.id);
    const migrated = after.filter((task) => cards.some((card) => card.id === task.id));
    expect(migrated.map((task) => task.id)).toEqual(cards.map((card) => card.id));
    for (const task of migrated) expect(task).toMatchObject({ status: 'done', completedAt: expect.any(String) });
    const event = (await outboxEvents(t, 'board.column.removed')).find((entry) => entry.payload.columnId === staging.id);
    expect(event?.payload).toMatchObject({ columnId: staging.id, disposition: 'migrate', targetColumnId: done.id, taskIds: cards.map((card) => card.id) });

    const shelf = await addColumn('بایگانی موقت');
    const shelved = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'بایگانی شود', columnId: shelf.id });
    expectStatus(await t.http().delete(`${base()}/workflow/columns/${shelf.id}`).set(bearer(owner)).send({ disposition: { kind: 'archive' } }), 204);
    expect((await board()).tasks.map((task) => task.id)).not.toContain(shelved.id);
    const archived = await t.http().get(`${base()}/tasks/${shelved.id}`).set(bearer(owner));
    expect(archived.body).toMatchObject({ archived: true });
  });

  it('gives 20 parallel moves into one column a consistent, gapless order', async () => {
    const target = await addColumn('موازی');
    const tasks = await Promise.all(Array.from({ length: 20 }, (_, index) => createTask(t, owner, workspace.id, { projectId: project.id, title: `موازی ${index}` })));
    const anchor = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'لنگر', columnId: target.id });
    // Half append at the end, half squeeze in right after the same anchor card.
    const responses = await Promise.all(tasks.map((task, index) => move(task, target.id, index % 2 === 0 ? {} : { afterId: anchor.id })));
    for (const response of responses) expectStatus(response, 200);
    const cards = inColumn(await board(), target.id);
    expect(cards).toHaveLength(21);
    expect(new Set(cards.map((card) => card.position)).size).toBe(21);
    expect(new Set(cards.map((card) => card.id))).toEqual(new Set([anchor.id, ...tasks.map((task) => task.id)]));
    // Everything placed "after the anchor" sits between the anchor and the appended cards.
    const anchorIndex = cards.findIndex((card) => card.id === anchor.id);
    const squeezed = new Set(tasks.filter((_, index) => index % 2 === 1).map((task) => task.id));
    expect(cards.slice(anchorIndex + 1, anchorIndex + 1 + squeezed.size).every((card) => squeezed.has(card.id))).toBe(true);
  });

  it('refuses a stale version with 412 and the current card', async () => {
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'نسخه' });
    const inProgress = (await getWorkflow(t, owner, workspace.id, project.id)).columns.find((column) => column.status === 'in-progress') as ColumnView;
    const moved = await move(task, inProgress.id);
    expectStatus(moved, 200);
    expect((await outboxEvents(t, 'task.moved', task.id)).map((event) => event.payload)).toEqual([
      { taskId: task.id, projectId: project.id, fromColumnId: task.columnId, toColumnId: inProgress.id, position: moved.body.position, version: task.version + 1 },
    ]);
    const stale = await move(task, inProgress.id);
    expectStatus(stale, 412);
    expect(stale.body.current).toMatchObject({ id: task.id, version: task.version + 1, columnId: inProgress.id });
    expect(stale.headers.etag).toBe(`"${task.version + 1}"`);
    const patch = await t.http().patch(`${base()}/tasks/${task.id}`).set(bearer(owner)).set('If-Match', `"${task.version}"`).send({ title: 'قدیمی' });
    expectStatus(patch, 412);
    const missing = await t.http().patch(`${base()}/tasks/${task.id}`).set(bearer(owner)).send({ title: 'بی‌نسخه' });
    expectStatus(missing, 428);
  });

  it('answers 409 COLUMN_GONE to a move into a column deleted meanwhile, and never strands a card', async () => {
    const doomed = await addColumn('رو به حذف');
    const refuge = (await getWorkflow(t, owner, workspace.id, project.id)).columns.find((column) => column.status === 'todo') as ColumnView;
    const tasks = await Promise.all(Array.from({ length: 8 }, (_, index) => createTask(t, owner, workspace.id, { projectId: project.id, title: `هم‌زمان ${index}` })));
    const [removal, ...moves] = await Promise.all([
      t.http().delete(`${base()}/workflow/columns/${doomed.id}`).set(bearer(owner)).send({ disposition: { kind: 'migrate', targetColumnId: refuge.id } }),
      ...tasks.map((task) => move(task, doomed.id)),
    ]);
    expectStatus(removal as Awaited<ReturnType<typeof move>>, 204);
    for (const response of moves) expect([200, 409]).toContain(response.status);
    for (const response of moves.filter((entry) => entry.status === 409)) expect(response.body.code).toBe('COLUMN_GONE');
    const { rows } = await t.admin.query('select count(*)::int as n from tasks where column_id = $1 and deleted_at is null and archived_at is null', [doomed.id]);
    expect(rows[0].n).toBe(0);
    const late = await move(tasks[0] as TaskCard, doomed.id);
    expect([409, 412]).toContain(late.status);
  });

  it('completes a card into the first done column and reopens it where it was', async () => {
    const review = (await getWorkflow(t, owner, workspace.id, project.id)).columns.find((column) => column.status === 'review') as ColumnView;
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'تیک', columnId: review.id });
    const done = await t.http().post(`${base()}/tasks/${task.id}/complete`).set(bearer(owner)).send({ completed: true });
    expectStatus(done, 200);
    expect(done.body).toMatchObject({ status: 'done', completedAt: expect.any(String) });
    const reopened = await t.http().post(`${base()}/tasks/${task.id}/complete`).set(bearer(owner)).send({ completed: false });
    expectStatus(reopened, 200);
    expect(reopened.body).toMatchObject({ status: 'review', columnId: review.id, completedAt: null });
    expect((await outboxEvents(t, 'task.status_changed', task.id)).map((event) => [event.payload.from, event.payload.to])).toEqual([
      ['review', 'done'],
      ['done', 'review'],
    ]);
  });

  it('reopens into the first to-do column when the remembered column is gone', async () => {
    const temporary = await addColumn('گذرا');
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'بی‌خانمان', columnId: temporary.id });
    expectStatus(await t.http().post(`${base()}/tasks/${task.id}/complete`).set(bearer(owner)).send({ completed: true }), 200);
    expectStatus(await t.http().delete(`${base()}/workflow/columns/${temporary.id}`).set(bearer(owner)).send({}), 204);
    const reopened = await t.http().post(`${base()}/tasks/${task.id}/complete`).set(bearer(owner)).send({ completed: false });
    expectStatus(reopened, 200);
    expect(reopened.body.status).toBe('todo');
  });

  it('rewrites a column’s keys once they grow past 50 characters, keeping the order', async () => {
    const column = await addColumn('فشرده');
    const first = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'اول', columnId: column.id });
    const last = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'آخر', columnId: column.id });
    // Two neighbours whose keys leave no short key between them.
    await t.admin.query('update tasks set position = $2 where id = $1', [first.id, `a0${'V'.repeat(50)}`]);
    await t.admin.query('update tasks set position = $2 where id = $1', [last.id, `a0${'V'.repeat(49)}W`]);
    const mover = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'میانه' });
    const moved = await move(mover, column.id, { afterId: first.id, beforeId: last.id });
    expectStatus(moved, 200);
    const cards = inColumn(await board(), column.id);
    expect(cards.map((card) => card.id)).toEqual([first.id, mover.id, last.id]);
    for (const card of cards) expect(card.position.length).toBeLessThanOrEqual(4);
  });
});

describe('Phase 1.5: every project has a board of its own', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let alpha: ProjectView;
  let beta: ProjectView;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    alpha = await createProject(t, owner, workspace.id, { key: 'ALF', name: 'آلفا' });
    beta = await createProject(t, owner, workspace.id, { key: 'BTA', name: 'بتا' });
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const workflowOf = (project: ProjectView) => getWorkflow(t, owner, workspace.id, project.id);
  const titlesOf = async (project: ProjectView) => (await workflowOf(project)).columns.map((column) => column.title);
  const addColumn = async (project: ProjectView, title: string) => {
    const response = await t.http().post(`${base()}/workflow/columns`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ projectId: project.id, title });
    expectStatus(response, 201);
    return response.body as WorkflowView;
  };
  const move = (task: TaskCard, columnId: string) => t.http().post(`${base()}/tasks/${task.id}/move`).set(bearer(owner)).send({ columnId, expectedVersion: task.version });

  it('gives each new project its own copy of the four built-in columns', async () => {
    const [a, b] = await Promise.all([workflowOf(alpha), workflowOf(beta)]);
    expect(a.id).not.toBe(b.id);
    expect([a.projectId, b.projectId]).toEqual([alpha.id, beta.id]);
    for (const view of [a, b]) {
      expect(view.columns.map((column) => [column.title, column.status, column.builtIn])).toEqual([
        ['برای انجام', 'todo', true],
        ['در حال انجام', 'in-progress', true],
        ['منتظر تایید', 'review', true],
        ['انجام شد', 'done', true],
      ]);
    }
    expect(new Set([...a.columns, ...b.columns].map((column) => column.id)).size).toBe(8);
  });

  it('adds, renames, reorders and deletes columns on one board without touching another', async () => {
    const betaBefore = await titlesOf(beta);
    const qa = (await addColumn(alpha, 'تست کیفیت')).columns.find((column) => column.title === 'تست کیفیت') as ColumnView;
    expect(await titlesOf(beta)).toEqual(betaBefore);

    expectStatus(await t.http().patch(`${base()}/workflow/columns/${qa.id}`).set(bearer(owner)).send({ title: 'QA', afterColumnId: null }), 200);
    const alphaTodo = (await workflowOf(alpha)).columns.find((column) => column.status === 'todo') as ColumnView;
    expectStatus(await t.http().patch(`${base()}/workflow/columns/${alphaTodo.id}`).set(bearer(owner)).send({ title: 'صف' }), 200);
    expect((await titlesOf(alpha)).slice(0, 2)).toEqual(['QA', 'صف']);
    expect(await titlesOf(beta)).toEqual(betaBefore);

    // Names are unique per board, not per workspace.
    await addColumn(beta, 'QA');
    expectStatus(await t.http().delete(`${base()}/workflow/columns/${qa.id}`).set(bearer(owner)).send({}), 204);
    expect(await titlesOf(beta)).toEqual([...betaBefore, 'QA']);
    expect(await titlesOf(alpha)).not.toContain('QA');

    const added = await outboxEvents(t, 'board.column.added');
    expect(added.map((event) => event.payload.projectId)).toEqual([alpha.id, beta.id]);
    expect((await outboxEvents(t, 'board.column.removed')).map((event) => event.payload.projectId)).toEqual([alpha.id]);
  });

  it('keeps a project’s cards on its own columns', async () => {
    const [alphaFlow, betaFlow] = await Promise.all([workflowOf(alpha), workflowOf(beta)]);
    const task = await createTask(t, owner, workspace.id, { projectId: beta.id, title: 'کار بتا' });
    expect(betaFlow.columns.map((column) => column.id)).toContain(task.columnId);
    const foreign = alphaFlow.columns.find((column) => column.status === 'in-progress') as ColumnView;
    const refused = await move(task, foreign.id);
    expectStatus(refused, 409);
    expect(refused.body.code).toBe('COLUMN_GONE');
    const create = await t.http().post(`${base()}/tasks`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ projectId: beta.id, title: 'نابجا', columnId: foreign.id });
    expectStatus(create, 409);
    const board = (await t.http().get(`${base()}/board?projectId=${beta.id}`).set(bearer(owner))).body as BoardView;
    expect(board.workflowId).toBe(betaFlow.id);
    expect(board.columns.map((column) => column.id)).toEqual(betaFlow.columns.map((column) => column.id));
  });

  it('lists every visible project’s board at once, and needs a project for one', async () => {
    const response = await t.http().get(`${base()}/workflows`).set(bearer(owner));
    expectStatus(response, 200);
    const views = response.body as WorkflowView[];
    expect(views.map((view) => view.projectId)).toEqual([alpha.id, beta.id]);
    expect(views.find((view) => view.projectId === beta.id)).toEqual(await workflowOf(beta));
    expectStatus(await t.http().get(`${base()}/workflow`).set(bearer(owner)), 400);
    expectStatus(await t.http().post(`${base()}/workflow/columns`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ title: 'بی‌پروژه' }), 400);
  });

  it('splits a board two projects shared before (migration 0009, replayed on this workspace)', async () => {
    // The old shape: delta on gamma's workflow, with a custom column holding cards of both.
    const gamma = await createProject(t, owner, workspace.id, { key: 'GAM', name: 'گاما' });
    const delta = await createProject(t, owner, workspace.id, { key: 'DLT', name: 'دلتا' });
    const shared = await workflowOf(gamma);
    await t.admin.query('update projects set workflow_id = $1 where id = $2', [shared.id, delta.id]);
    const custom = (await addColumn(gamma, 'اشتراکی')).columns.find((column) => column.title === 'اشتراکی') as ColumnView;
    const gammaTask = await createTask(t, owner, workspace.id, { projectId: gamma.id, title: 'کار گاما', columnId: custom.id });
    const deltaTask = await createTask(t, owner, workspace.id, { projectId: delta.id, title: 'کار دلتا', columnId: custom.id });
    expectStatus(await t.http().post(`${base()}/tasks/${deltaTask.id}/complete`).set(bearer(owner)).send({ completed: true }), 200);

    const migration = readFileSync(new URL('../../db/migrations/0009_project_workflows.sql', import.meta.url), 'utf8')
      // Only this workspace's projects: the rest of this test database is someone else's.
      .replace('FROM projects p;', `FROM projects p WHERE p.workspace_id = '${workspace.id}' AND p.id IN ('${gamma.id}', '${delta.id}');`);
    for (const statement of migration.split('--> statement-breakpoint')) await t.admin.query(statement);

    const [g, d] = await Promise.all([workflowOf(gamma), workflowOf(delta)]);
    expect(g.id).not.toBe(d.id);
    expect(g.columns.map((column) => column.title)).toEqual(d.columns.map((column) => column.title));
    expect(g.columns.map((column) => column.title)).toContain('اشتراکی');
    const cards = ((await t.http().get(`${base()}/tasks?limit=200`).set(bearer(owner))).body as { items: TaskCard[] }).items;
    const card = (id: string) => cards.find((entry) => entry.id === id) as TaskCard;
    expect(g.columns.find((column) => column.id === card(gammaTask.id).columnId)?.title).toBe('اشتراکی');
    expect(card(deltaTask.id).status).toBe('done');
    expect(d.columns.map((column) => column.id)).toContain(card(deltaTask.id).columnId);
    // The remembered column moved too: reopening lands on delta's own «اشتراکی».
    const reopened = await t.http().post(`${base()}/tasks/${deltaTask.id}/complete`).set(bearer(owner)).send({ completed: false });
    expectStatus(reopened, 200);
    expect(d.columns.find((column) => column.id === reopened.body.columnId)?.title).toBe('اشتراکی');
    // And from now on the two boards are independent.
    await addColumn(gamma, 'فقط گاما');
    expect((await workflowOf(delta)).columns.map((column) => column.title)).not.toContain('فقط گاما');
  });
});
