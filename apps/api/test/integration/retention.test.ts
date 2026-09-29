import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConversationView, MemberView, ProjectView, TaskPage, TrashedProjectView, WorkspaceView } from '@taskin/contracts';
import { UnitOfWork } from '../../src/platform/db/unit-of-work.js';
import { ProjectsService } from '../../src/modules/work/projects.service.js';
import { MembersService } from '../../src/modules/workspaces/members.service.js';
import { addMember, bearer, createTestApp, idempotencyKey, localForm, ownerWithWorkspace, type Session, stepUp, type TestApp } from './harness.js';
import { createConversation, history, sendRest } from './chat-helpers.js';
import { createProject, createTask, expectStatus, outboxEvents, putProjectMember, usePlan, wsPath } from './work-helpers.js';

describe('Phase 3.1: project channels, the project trash and departed members', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let admin: Session;
  let member: Session;
  let other: Session;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    admin = await addMember(t, owner, workspace.id, 'admin');
    member = await addMember(t, owner, workspace.id, 'member');
    other = await addMember(t, owner, workspace.id, 'member');
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => wsPath(workspace.id);
  const listProjects = async (as: Session): Promise<ProjectView[]> => {
    const response = await t.http().get(`${base()}/projects`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as ProjectView[];
  };
  const conversations = async (as: Session): Promise<ConversationView[]> => {
    const response = await t.http().get(`${base()}/conversations`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as ConversationView[];
  };
  const channelOf = async (as: Session, projectId: string) => (await conversations(as)).find((entry) => entry.projectId === projectId);
  const trash = async (as: Session): Promise<TrashedProjectView[]> => {
    const response = await t.http().get(`${base()}/projects/trash`).set(bearer(as));
    expectStatus(response, 200);
    return response.body as TrashedProjectView[];
  };
  const removeMember = async (userId: string) => {
    const response = await t.http().delete(`${base()}/members/${userId}`).set(bearer(await stepUp(t, owner)));
    expectStatus(response, 204);
  };
  /** Invites a removed member again; they accept with the session they still have. */
  const reinvite = async (session: Session) => {
    const sent = await t
      .http()
      .post(`${base()}/invitations`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ recipients: [{ address: localForm(session.phone) }], role: 'member' });
    expectStatus(sent, 201);
    await t.flushNotifications();
    const link = t.sms.lastTo(session.phone)?.tokens.link;
    const token = link ? new URL(link).searchParams.get('token') : null;
    expectStatus(await t.http().post('/api/v1/invitations/accept').set(bearer(session)).send({ token }), 200);
  };

  /* ------------------------------------------------------------------ project channels */

  it('opens a private channel with every new project, with its creator and its members', async () => {
    const project = await createProject(t, admin, workspace.id, { name: 'سامانه فروش', memberIds: [member.userId] });
    expect([...project.memberIds].sort()).toEqual([admin.userId, member.userId].sort());
    const channel = await channelOf(admin, project.id);
    expect(channel).toMatchObject({ kind: 'channel', title: 'سامانه فروش', isPrivate: true, membershipMode: 'project_synced', myRole: 'owner' });
    expect([...(channel?.memberIds ?? [])].sort()).toEqual([admin.userId, member.userId].sort());
    expect((await channelOf(member, project.id))?.myRole).toBe('member');
    expect(await channelOf(other, project.id)).toBeUndefined();
    expect(await outboxEvents(t, 'conversation.created', channel?.id)).toHaveLength(1);
  });

  it('keeps the channel in step with the project’s members; the channel itself cannot change them', async () => {
    const project = await createProject(t, admin, workspace.id);
    const channel = await channelOf(admin, project.id);
    if (!channel) throw new Error('no project channel');
    await putProjectMember(t, admin, workspace.id, project.id, other.userId, 'contributor');
    expect((await channelOf(other, project.id))?.myRole).toBe('member');
    await putProjectMember(t, admin, workspace.id, project.id, other.userId, 'lead');
    expect((await channelOf(other, project.id))?.myRole).toBe('admin');
    expectStatus(await t.http().delete(`${base()}/projects/${project.id}/members/${other.userId}`).set(bearer(admin)), 204);
    expect(await channelOf(other, project.id)).toBeUndefined();
    expect(await outboxEvents(t, 'conversation.member.added', channel.id)).toHaveLength(2);
    expect(await outboxEvents(t, 'conversation.member.removed', channel.id)).toHaveLength(1);

    const put = await t.http().put(`${base()}/conversations/${channel.id}/members/${member.userId}`).set(bearer(admin)).send({ role: 'member' });
    expectStatus(put, 409);
    expect(put.body.code).toBe('PROJECT_CHANNEL');
    expectStatus(await t.http().delete(`${base()}/conversations/${channel.id}/members/${admin.userId}`).set(bearer(admin)), 409);

    expectStatus(await t.http().patch(`${base()}/projects/${project.id}`).set(bearer(admin)).send({ name: 'نام تازه پروژه' }), 200);
    expect((await channelOf(admin, project.id))?.title).toBe('نام تازه پروژه');
  });

  /* ------------------------------------------------------------------ the project trash */

  it('lets only the workspace owner delete a project, which vanishes everywhere and waits 40 days in the trash', async () => {
    const project = await createProject(t, admin, workspace.id, { name: 'پروژه موقت', memberIds: [member.userId] });
    const task = await createTask(t, admin, workspace.id, { projectId: project.id, title: 'وظیفه موقت' });
    const channel = await channelOf(member, project.id);

    const refused = await t.http().delete(`${base()}/projects/${project.id}`).set(bearer(admin));
    expectStatus(refused, 403);
    expectStatus(await t.http().delete(`${base()}/projects/${project.id}`).set(bearer(owner)), 204);

    for (const as of [owner, admin, member]) expect((await listProjects(as)).some((entry) => entry.id === project.id)).toBe(false);
    expectStatus(await t.http().get(`${base()}/projects/${project.id}`).set(bearer(owner)), 404);
    expectStatus(await t.http().get(`${base()}/tasks/${task.id}`).set(bearer(admin)), 404);
    const page = (await t.http().get(`${base()}/tasks`).set(bearer(owner))).body as TaskPage;
    expect(page.items.some((item) => item.id === task.id)).toBe(false);
    expect(await channelOf(member, project.id)).toBeUndefined();

    expectStatus(await t.http().get(`${base()}/projects/trash`).set(bearer(admin)), 403);
    const entry = (await trash(owner)).find((item) => item.id === project.id);
    expect(entry).toMatchObject({ name: 'پروژه موقت', key: project.key, taskCount: 1, deletedBy: owner.userId });
    expect(new Date(entry?.purgeAt ?? 0).getTime() - new Date(entry?.deletedAt ?? 0).getTime()).toBe(40 * 86_400_000);

    expectStatus(await t.http().post(`${base()}/projects/${project.id}/restore`).set(bearer(admin)), 403);
    const restored = await t.http().post(`${base()}/projects/${project.id}/restore`).set(bearer(owner));
    expectStatus(restored, 200);
    expect(restored.body).toMatchObject({ id: project.id, name: 'پروژه موقت', taskCount: 1 });
    expectStatus(await t.http().get(`${base()}/tasks/${task.id}`).set(bearer(admin)), 200);
    expect((await channelOf(member, project.id))?.id).toBe(channel?.id);
    expect((await trash(owner)).some((item) => item.id === project.id)).toBe(false);
    expect(await outboxEvents(t, 'project.restored', project.id)).toHaveLength(1);
  });

  it('restores only while the project’s key is free and the plan has room', async () => {
    const first = await createProject(t, owner, workspace.id, { key: 'TRASH' });
    expectStatus(await t.http().delete(`${base()}/projects/${first.id}`).set(bearer(owner)), 204);
    // The key is free again for a live project, so the trashed one cannot take it back.
    await createProject(t, owner, workspace.id, { key: 'TRASH' });
    const taken = await t.http().post(`${base()}/projects/${first.id}/restore`).set(bearer(owner));
    expectStatus(taken, 409);
    expect(taken.body.code).toBe('PROJECT_KEY_TAKEN');

    const small = await ownerWithWorkspace(t, 'فضای کوچک');
    const projects = [];
    for (let index = 0; index < 5; index += 1) projects.push(await createProject(t, small.owner, small.workspace.id));
    const first5 = projects[0] as ProjectView;
    expectStatus(await t.http().delete(`${wsPath(small.workspace.id)}/projects/${first5.id}`).set(bearer(small.owner)), 204);
    await createProject(t, small.owner, small.workspace.id);
    const full = await t.http().post(`${wsPath(small.workspace.id)}/projects/${first5.id}/restore`).set(bearer(small.owner));
    expectStatus(full, 402);
    expect(full.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('hides trashed projects in row-level security too, unless a transaction opts in', async () => {
    const project = await createProject(t, owner, workspace.id);
    expectStatus(await t.http().delete(`${base()}/projects/${project.id}`).set(bearer(owner)), 204);
    const uow = t.app.get(UnitOfWork);
    const query = sql`select id from projects where id = ${project.id}`;
    const plain = await uow.run({ workspaceId: workspace.id, userId: owner.userId }, ({ tx }) => tx.execute(query));
    expect(plain.rows).toHaveLength(0);
    const opted = await uow.run({ workspaceId: workspace.id, userId: owner.userId, includeDeleted: true }, ({ tx }) => tx.execute(query));
    expect(opted.rows).toHaveLength(1);
  });

  it('purges a project 40 days after its deletion; its channel history and calendar events stay', async () => {
    const project = await createProject(t, owner, workspace.id, { name: 'پروژه رفتنی', memberIds: [member.userId] });
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'وظیفه رفتنی', subtasks: ['گام'] });
    const channel = await channelOf(owner, project.id);
    if (!channel) throw new Error('no project channel');
    const sent = await sendRest(t, member, workspace.id, channel.id, { text: 'پیامی که می‌ماند' });
    const event = await t
      .http()
      .post(`${base()}/calendar/events`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ kind: 'milestone', title: 'نقطه عطف', date: '2030-02-01', projectId: project.id, attendeeIds: [] });
    expectStatus(event, 201);
    expectStatus(await t.http().delete(`${base()}/projects/${project.id}`).set(bearer(owner)), 204);

    const purge = () => t.app.get(ProjectsService).purgeDue();
    await t.admin.query(`update projects set deleted_at = now() - interval '39 days' where id = $1`, [project.id]);
    expect(await purge()).toBe(0);
    await t.admin.query(`update projects set deleted_at = now() - interval '41 days' where id = $1`, [project.id]);
    expect(await purge()).toBe(1);

    const count = async (query: string, id: string) => Number((await t.admin.query<{ n: string }>(query, [id])).rows[0]?.n);
    expect(await count('select count(*) as n from projects where id = $1', project.id)).toBe(0);
    expect(await count('select count(*) as n from tasks where id = $1', task.id)).toBe(0);
    expect(await count('select count(*) as n from subtasks where task_id = $1', task.id)).toBe(0);
    expect(await count('select count(*) as n from messages where id = $1', sent.id)).toBe(1);
    const kept = await t.admin.query<{ project_id: string | null }>('select project_id from conversations where id = $1', [channel.id]);
    expect(kept.rows[0]).toEqual({ project_id: null });
    const milestone = await t.admin.query<{ project_id: string | null }>('select project_id from calendar_events where id = $1', [event.body.id]);
    expect(milestone.rows[0]).toEqual({ project_id: null });
    expect((await trash(owner)).some((item) => item.id === project.id)).toBe(false);
  });

  /* ------------------------------------------------------------------ departed members */

  it('keeps what a removed member wrote, names them as a former member, and takes them back within 40 days', async () => {
    const departing = await addMember(t, owner, workspace.id, 'member');
    const project = await createProject(t, admin, workspace.id, { memberIds: [departing.userId] });
    const task = await createTask(t, departing, workspace.id, { projectId: project.id, title: 'نوشته عضو رفته' });
    const group = await createConversation(t, admin, workspace.id, { kind: 'group', title: 'گروه ماندگار', memberIds: [departing.userId] });
    const sent = await sendRest(t, departing, workspace.id, group.id, { text: 'پیام ماندگار' });

    await removeMember(departing.userId);

    const page = await history(t, admin, workspace.id, group.id);
    expect(page.items.find((item) => item.id === sent.id)).toMatchObject({ authorId: departing.userId, text: 'پیام ماندگار', deleted: false });
    expectStatus(await t.http().get(`${base()}/tasks/${task.id}`).set(bearer(admin)), 200);
    const plain = (await t.http().get(`${base()}/members`).set(bearer(admin))).body as MemberView[];
    expect(plain.some((entry) => entry.userId === departing.userId)).toBe(false);
    const all = (await t.http().get(`${base()}/members?includeFormer=true`).set(bearer(admin))).body as MemberView[];
    const former = all.find((entry) => entry.userId === departing.userId);
    expect(former).toMatchObject({ status: 'left', phone: '', email: null, online: false });
    expect(former?.leftAt).toBeTruthy();
    expect((await listProjects(admin)).find((entry) => entry.id === project.id)?.memberIds).not.toContain(departing.userId);

    await reinvite(departing);
    const theirs = (await conversations(departing)).map((entry) => entry.id);
    expect(theirs).toContain(group.id);
    expect(theirs).toContain((await channelOf(admin, project.id))?.id);
    expect((await listProjects(departing)).find((entry) => entry.id === project.id)?.myRole).toBe('contributor');
  });

  it('forgets a departed member’s projects after 40 days; a later invitation starts afresh', async () => {
    const departing = await addMember(t, owner, workspace.id, 'member');
    const project = await createProject(t, admin, workspace.id, { memberIds: [departing.userId] });
    const group = await createConversation(t, admin, workspace.id, { kind: 'group', title: 'گروه قدیمی', memberIds: [departing.userId] });
    const sent = await sendRest(t, departing, workspace.id, group.id, { text: 'پیام قدیمی' });
    await removeMember(departing.userId);

    const members = t.app.get(MembersService);
    await t.admin.query(`update workspace_members set left_at = now() - interval '39 days' where workspace_id = $1 and user_id = $2`, [workspace.id, departing.userId]);
    expect(await members.purgeDeparted()).toBe(0);
    await t.admin.query(`update workspace_members set left_at = now() - interval '41 days' where workspace_id = $1 and user_id = $2`, [workspace.id, departing.userId]);
    expect(await members.purgeDeparted()).toBe(1);
    const held = await t.admin.query('select 1 from project_members where workspace_id = $1 and user_id = $2', [workspace.id, departing.userId]);
    expect(held.rows).toHaveLength(0);
    expect((await history(t, admin, workspace.id, group.id)).items.some((item) => item.id === sent.id)).toBe(true);

    await reinvite(departing);
    expect((await conversations(departing)).some((entry) => entry.id === group.id)).toBe(false);
    expect((await listProjects(departing)).find((entry) => entry.id === project.id)?.myRole ?? null).toBeNull();
  });
});
