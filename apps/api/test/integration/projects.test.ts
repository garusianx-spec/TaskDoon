import { subject } from '@casl/ability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectView, TaskPage, WorkspaceView } from '@taskin/contracts';
import { UnitOfWork } from '../../src/platform/db/unit-of-work.js';
import { AbilityFactory } from '../../src/modules/rbac/ability.js';
import { MembershipService } from '../../src/modules/rbac/membership.service.js';
import { AccessService } from '../../src/modules/work/access.js';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createProject, createTask, expectStatus, outboxEvents, projectKey, putProjectMember, usePlan, wsPath } from './work-helpers.js';

describe('M2: projects', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let admin: Session;
  let manager: Session;
  let member: Session;
  let guest: Session;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    admin = await addMember(t, owner, workspace.id, 'admin');
    manager = await addMember(t, owner, workspace.id, 'manager');
    member = await addMember(t, owner, workspace.id, 'member');
    guest = await addMember(t, owner, workspace.id, 'guest');
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const listProjects = async (as: Session) => {
    const response = await t.http().get(`${base()}/projects`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as ProjectView[];
  };

  it('creates a project led by its creator, with an upper-case key unique among live projects', async () => {
    const project = await createProject(t, manager, workspace.id, { key: 'crm', name: 'سامانه مشتریان' });
    expect(project).toMatchObject({ key: 'CRM', name: 'سامانه مشتریان', visibility: 'workspace', myRole: 'lead', starred: false, archived: false });
    expect(project.myActions).toEqual(['view', 'create', 'edit', 'delete', 'assign']);
    expect(project.memberIds).toEqual([manager.userId]);

    const duplicate = await t.http().post(`${base()}/projects`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ key: 'CRM', name: 'دوباره' });
    expectStatus(duplicate, 409);
    expect(duplicate.body.code).toBe('PROJECT_KEY_TAKEN');
    const invalid = await t.http().post(`${base()}/projects`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ key: '1AB', name: 'نامعتبر' });
    expectStatus(invalid, 400);
    expect((await outboxEvents(t, 'project.created', project.id)).length).toBe(1);
  });

  it('keeps guests from creating projects (the matrix gives them boards:view only)', async () => {
    const response = await t.http().post(`${base()}/projects`).set(bearer(guest)).set('Idempotency-Key', idempotencyKey()).send({ key: projectKey(), name: 'مهمان' });
    expectStatus(response, 403);
  });

  it('keeps projects flat: there is no parent to give, and the database refuses one', async () => {
    const project = await createProject(t, owner, workspace.id);
    expect(project.parentId).toBeNull();
    const nested = await t
      .http()
      .post(`${base()}/projects`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ key: projectKey(), name: 'زیرپروژه', parentId: project.id });
    expectStatus(nested, 400);
    expectStatus(await t.http().patch(`${base()}/projects/${project.id}`).set(bearer(owner)).send({ parentId: project.id }), 400);
    const other = await createProject(t, owner, workspace.id);
    await expect(t.admin.query('update projects set parent_id = $1 where id = $2', [project.id, other.id])).rejects.toThrow(/projects_flat/);
    expect((await listProjects(owner)).every((entry) => entry.parentId === null)).toBe(true);
  });

  it('stars projects per user', async () => {
    const project = await createProject(t, owner, workspace.id);
    expectStatus(await t.http().put(`${base()}/projects/${project.id}/star`).set(bearer(member)), 204);
    expect((await listProjects(member)).find((entry) => entry.id === project.id)?.starred).toBe(true);
    expect((await listProjects(owner)).find((entry) => entry.id === project.id)?.starred).toBe(false);
    expectStatus(await t.http().delete(`${base()}/projects/${project.id}/star`).set(bearer(member)), 204);
    expect((await listProjects(member)).find((entry) => entry.id === project.id)?.starred).toBe(false);
  });

  it('hides private projects from everyone but their members and the owner', async () => {
    const secret = await createProject(t, manager, workspace.id, { visibility: 'private', name: 'پروژه محرمانه' });
    const task = await createTask(t, manager, workspace.id, { projectId: secret.id, title: 'کار محرمانه' });
    for (const outsider of [admin, member, guest]) {
      expect((await listProjects(outsider)).map((entry) => entry.id)).not.toContain(secret.id);
      expectStatus(await t.http().get(`${base()}/projects/${secret.id}`).set(bearer(outsider)), 404);
      expectStatus(await t.http().get(`${base()}/board?projectId=${secret.id}`).set(bearer(outsider)), 404);
      expectStatus(await t.http().get(`${base()}/tasks/${task.id}`).set(bearer(outsider)), 404);
      const page = (await t.http().get(`${base()}/tasks?limit=200`).set(bearer(outsider))).body as TaskPage;
      expect(page.items.map((item) => item.id)).not.toContain(task.id);
    }
    expect((await listProjects(owner)).map((entry) => entry.id)).toContain(secret.id);
    await putProjectMember(t, manager, workspace.id, secret.id, member.userId, 'viewer');
    expectStatus(await t.http().get(`${base()}/tasks/${task.id}`).set(bearer(member)), 200);
    // Viewers look; they do not touch.
    const edit = await t.http().patch(`${base()}/tasks/${task.id}`).set(bearer(member)).set('If-Match', `"${task.version}"`).send({ title: 'تغییر' });
    expectStatus(edit, 403);
  });

  it('shows guests only the projects they are members of, capped at contributor', async () => {
    const open = await createProject(t, owner, workspace.id, { name: 'پروژه عمومی' });
    expect((await listProjects(guest)).map((entry) => entry.id)).not.toContain(open.id);
    const lead = await t.http().put(`${base()}/projects/${open.id}/members/${guest.userId}`).set(bearer(owner)).send({ role: 'lead' });
    expectStatus(lead, 400);
    await putProjectMember(t, owner, workspace.id, open.id, guest.userId, 'contributor');
    const seen = (await listProjects(guest)).find((entry) => entry.id === open.id);
    expect(seen?.myActions).toEqual(['view', 'create', 'edit', 'assign']);
    // A contributor can create where the workspace role alone could not.
    await createTask(t, guest, workspace.id, { projectId: open.id, title: 'کار مهمان' });
  });

  it('never lets anyone hand out more than they hold in a project', async () => {
    const project = await createProject(t, owner, workspace.id);
    await putProjectMember(t, owner, workspace.id, project.id, member.userId, 'contributor');
    const escalate = await t.http().put(`${base()}/projects/${project.id}/members/${manager.userId}`).set(bearer(member)).send({ role: 'lead' });
    expectStatus(escalate, 403);
    expect(escalate.body.code).toBe('PRIVILEGE_ESCALATION');
    await putProjectMember(t, member, workspace.id, project.id, manager.userId, 'viewer');
    await putProjectMember(t, owner, workspace.id, project.id, admin.userId, 'lead');
    const demoteLead = await t.http().delete(`${base()}/projects/${project.id}/members/${admin.userId}`).set(bearer(member));
    expectStatus(demoteLead, 403);
    const events = await outboxEvents(t, 'project.member.changed', project.id);
    expect(events.map((event) => event.payload.userId)).toEqual([member.userId, manager.userId, admin.userId]);
  });

  it('enforces the plan’s project limit', async () => {
    const fresh = await ownerWithWorkspace(t, 'فضای محدود');
    const { rows } = await t.admin.query<{ limit: number }>(`select (limits ->> 'maxProjects')::int as limit from plans where id = 'free'`);
    const limit = rows[0]?.limit ?? 0;
    for (let index = 0; index < limit; index += 1) await createProject(t, fresh.owner, fresh.workspace.id);
    const over = await t.http().post(`${wsPath(fresh.workspace.id)}/projects`).set(bearer(fresh.owner)).set('Idempotency-Key', idempotencyKey()).send({ key: projectKey(), name: 'یکی بیشتر' });
    expectStatus(over, 402);
    expect(over.body.code).toBe('PLAN_LIMIT_REACHED');
  });
});

describe('M2 checklist: CASL and SQL scoping agree', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('for every role, the tasks the API lists are exactly the tasks the ability lets them view', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const people = {
      owner,
      admin: await addMember(t, owner, workspace.id, 'admin'),
      manager: await addMember(t, owner, workspace.id, 'manager'),
      member: await addMember(t, owner, workspace.id, 'member'),
      guest: await addMember(t, owner, workspace.id, 'guest'),
    };
    // Every combination the rules distinguish: workspace-visible or private, with no project
    // role or with each of the three, for each workspace role.
    const open = await createProject(t, owner, workspace.id, { name: 'عمومی' });
    const openViewer = await createProject(t, owner, workspace.id, { name: 'عمومی با ناظر' });
    const secret = await createProject(t, owner, workspace.id, { visibility: 'private', name: 'خصوصی' });
    const secretLead = await createProject(t, owner, workspace.id, { visibility: 'private', name: 'خصوصی با رهبر' });
    const secretContributor = await createProject(t, owner, workspace.id, { visibility: 'private', name: 'خصوصی با همکار' });
    for (const who of [people.admin, people.member, people.guest]) {
      await putProjectMember(t, owner, workspace.id, openViewer.id, who.userId, 'viewer');
      await putProjectMember(t, owner, workspace.id, secretLead.id, who.userId, who === people.guest ? 'contributor' : 'lead');
    }
    await putProjectMember(t, owner, workspace.id, secretContributor.id, people.manager.userId, 'contributor');
    const projects = [open, openViewer, secret, secretLead, secretContributor];
    const tasks: { id: string; projectId: string }[] = [];
    for (const project of projects) {
      for (let index = 0; index < 2; index += 1) tasks.push({ id: (await createTask(t, owner, workspace.id, { projectId: project.id })).id, projectId: project.id });
    }

    const uow = t.app.get(UnitOfWork);
    const access = t.app.get(AccessService);
    const abilities = t.app.get(AbilityFactory);
    const memberships = t.app.get(MembershipService);
    for (const [role, session] of Object.entries(people)) {
      const context = await memberships.load(workspace.id, session.userId);
      if (!context) throw new Error(`${role} is not a member`);
      const scope = await uow.run({ workspaceId: workspace.id, userId: session.userId }, ({ tx }) => access.scope(tx, context));
      const ability = abilities.forMember(context, scope);
      const allowed = tasks.filter((task) => ability.can('view', subject('Task', { projectId: task.projectId }))).map((task) => task.id);

      const listed = ((await t.http().get(`${wsPath(workspace.id)}/tasks?limit=200`).set(bearer(session))).body as TaskPage).items.map((item) => item.id);
      expect({ role, tasks: [...listed].sort() }).toEqual({ role, tasks: [...allowed].sort() });

      // The same for projects, and the per-project actions the API reports.
      const visible = ((await t.http().get(`${wsPath(workspace.id)}/projects`).set(bearer(session))).body as ProjectView[]).filter((project) =>
        projects.some((entry) => entry.id === project.id),
      );
      for (const project of projects) {
        const reported = visible.find((entry) => entry.id === project.id);
        const expected = (['view', 'create', 'edit', 'delete', 'assign'] as const).filter((action) => ability.can(action, subject('Task', { projectId: project.id })));
        expect({ role, project: project.name, actions: reported?.myActions ?? [] }).toEqual({ role, project: project.name, actions: expected });
      }
    }
  });
});
