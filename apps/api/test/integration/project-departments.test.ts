import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DepartmentView, ProjectView, WorkspaceView } from '@taskin/contracts';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createProject, createTask, expectStatus, getWorkflow, projectKey, usePlan, wsPath } from './work-helpers.js';

describe('project creation with departments and members', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let contributor: Session;
  let departments: DepartmentView[];
  const base = () => wsPath(workspace.id);

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    contributor = await addMember(t, owner, workspace.id, 'member');
    const response = await t.http().get(`${base()}/departments`).set(bearer(owner));
    expectStatus(response, 200);
    departments = response.body as DepartmentView[];
  });
  afterAll(async () => { await t?.close(); });

  it('persists all selections, memberships, four columns and one companion in the creation transaction', async () => {
    const custom = await t.http().post(`${base()}/departments`).set(bearer(owner)).send({ name: 'پژوهش کاربردی' });
    expectStatus(custom, 201);
    const ids = [departments[0]!.id, departments[1]!.id, (custom.body as DepartmentView).id];
    const command = idempotencyKey();
    const body = { key: projectKey(), name: 'پروژه چندتیمی', departmentIds: [...ids, ids[0]], memberIds: [contributor.userId, contributor.userId, owner.userId] };
    const create = () => t.http().post(`${base()}/projects`).set(bearer(owner)).set('Idempotency-Key', command).send(body);
    const first = await create();
    expectStatus(first, 201);
    const project = first.body as ProjectView;
    expect(project.departmentId).toBe(ids[0]);
    expect(new Set(project.departmentIds)).toEqual(new Set(ids));
    expect(new Set(project.memberIds)).toEqual(new Set([owner.userId, contributor.userId]));
    const replay = await create();
    expectStatus(replay, 201);
    expect((replay.body as ProjectView).id).toBe(project.id);
    const read = await t.http().get(`${base()}/projects/${project.id}`).set(bearer(owner));
    expectStatus(read, 200);
    expect(new Set((read.body as ProjectView).departmentIds)).toEqual(new Set(ids));
    const stored = await t.admin.query<{ department_id: string }>('select department_id from project_departments where workspace_id = $1 and project_id = $2', [workspace.id, project.id]);
    expect(new Set(stored.rows.map(row => row.department_id))).toEqual(new Set(ids));
    const workflow = await getWorkflow(t, owner, workspace.id, project.id);
    expect(workflow.columns).toHaveLength(4);
    expect(new Set(workflow.columns.map(column => column.status))).toEqual(new Set(['todo', 'in-progress', 'review', 'done']));
    const channels = await t.admin.query<{ id: string }>('select id from conversations where workspace_id = $1 and project_id = $2', [workspace.id, project.id]);
    expect(channels.rows).toHaveLength(1);
    const people = await t.admin.query<{ user_id: string }>('select user_id from conversation_members where workspace_id = $1 and conversation_id = $2 and left_at is null', [workspace.id, channels.rows[0]!.id]);
    expect(new Set(people.rows.map(row => row.user_id))).toEqual(new Set([owner.userId, contributor.userId]));
    const task = await createTask(t, contributor, workspace.id, { projectId: project.id, title: 'نخستین کار' });
    expect(workflow.columns.map(column => column.id)).toContain(task.columnId);
  });

  it('supports replacement, omission, legacy scalar writes and clearing without changing its board', async () => {
    const project = await createProject(t, owner, workspace.id, { departmentId: departments[0]!.id });
    expect(project.departmentIds).toEqual([departments[0]!.id]);
    // A project that predates the junction has only the scalar; reads must not need a backfill.
    await t.admin.query('delete from project_departments where project_id = $1', [project.id]);
    const legacyRead = await t.http().get(`${base()}/projects/${project.id}`).set(bearer(owner));
    expectStatus(legacyRead, 200);
    expect((legacyRead.body as ProjectView).departmentIds).toEqual([departments[0]!.id]);
    const original = await getWorkflow(t, owner, workspace.id, project.id);
    const patch = async (body: object) => {
      const response = await t.http().patch(`${base()}/projects/${project.id}`).set(bearer(owner)).send(body);
      expectStatus(response, 200);
      return response.body as ProjectView;
    };
    const ids = [departments[1]!.id, departments[2]!.id];
    expect(new Set((await patch({ departmentIds: ids })).departmentIds)).toEqual(new Set(ids));
    expect(new Set((await patch({ name: 'نام جدید' })).departmentIds)).toEqual(new Set(ids));
    expect((await patch({ departmentId: departments[0]!.id })).departmentIds).toEqual([departments[0]!.id]);
    expect(await patch({ departmentIds: [] })).toMatchObject({ departmentId: null, departmentIds: [] });
    expect((await getWorkflow(t, owner, workspace.id, project.id)).columns).toEqual(original.columns);
  });

  it('rejects cross-workspace departments and foreign members without partial projects or workflows', async () => {
    const foreign = await ownerWithWorkspace(t, 'فضای دیگر');
    const foreignDepartments = await t.http().get(`${wsPath(foreign.workspace.id)}/departments`).set(bearer(foreign.owner));
    expectStatus(foreignDepartments, 200);
    const before = await t.admin.query('select (select count(*)::int from projects where workspace_id = $1) as projects, (select count(*)::int from workflows where workspace_id = $1) as workflows', [workspace.id]);
    for (const selection of [{ departmentIds: [departments[0]!.id, foreignDepartments.body[0].id] }, { memberIds: [foreign.owner.userId] }]) {
      const result = await t.http().post(`${base()}/projects`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ key: projectKey(), name: 'انتخاب نامعتبر', ...selection });
      expectStatus(result, 400);
      expect(result.body.code).toBe('VALIDATION_FAILED');
    }
    const after = await t.admin.query('select (select count(*)::int from projects where workspace_id = $1) as projects, (select count(*)::int from workflows where workspace_id = $1) as workflows', [workspace.id]);
    expect(after.rows).toEqual(before.rows);
  });

  it('keeps secondary selections when an old application changes the primary or that department is deleted', async () => {
    const project = await createProject(t, owner, workspace.id, { departmentIds: [departments[0]!.id, departments[1]!.id] });
    // Direct SQL deliberately emulates the previous application version, which only writes the scalar.
    await t.admin.query('update projects set department_id = $1 where id = $2', [departments[2]!.id, project.id]);
    const read = async () => {
      const response = await t.http().get(`${base()}/projects/${project.id}`).set(bearer(owner));
      expectStatus(response, 200);
      return response.body as ProjectView;
    };
    expect(new Set((await read()).departmentIds)).toEqual(new Set([departments[1]!.id, departments[2]!.id]));
    await t.admin.query('delete from departments where workspace_id = $1 and id = $2', [workspace.id, departments[2]!.id]);
    expect((await read()).departmentIds).toEqual([departments[1]!.id]);
  });
});
