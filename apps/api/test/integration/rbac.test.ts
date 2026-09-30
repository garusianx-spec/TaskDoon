import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RolePermissions, RoleView, WorkspaceView } from '@taskin/contracts';
import { DEFAULT_PERMISSION_MATRIX } from '@taskin/contracts';
import { addMember, bearer, createTestApp, ownerWithWorkspace, type Session, stepUp, type TestApp } from './harness.js';

describe('M1 checklist: RBAC', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let admin: Session;
  let manager: Session;
  let member: Session;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    admin = await addMember(t, owner, workspace.id, 'admin');
    manager = await addMember(t, owner, workspace.id, 'manager', { withPassword: true });
    member = await addMember(t, owner, workspace.id, 'member');
  });
  afterAll(async () => {
    await t?.close();
  });

  const base = () => `/api/v1/workspaces/${workspace.id}`;
  const roles = async (as: Session) => (await t.http().get(`${base()}/roles`).set(bearer(as))).body as RoleView[];
  const role = async (as: Session, key: string) => (await roles(as)).find((entry) => entry.key === key) as RoleView;
  const putPermissions = (as: Session, target: RoleView, permissions: RolePermissions, version = target.version) =>
    t.http().put(`${base()}/roles/${target.id}/permissions`).set(bearer(as)).set('If-Match', `"${version}"`).send({ permissions });

  it('seeds every workspace with the default matrix', async () => {
    const list = await roles(owner);
    expect(list.map((entry) => entry.key)).toEqual(['owner', 'admin', 'manager', 'member', 'guest']);
    for (const entry of list) expect(entry.permissions).toEqual(DEFAULT_PERMISSION_MATRIX[entry.key]);
    expect(list.find((entry) => entry.key === 'owner')?.locked).toBe(true);
  });

  it('reports the caller’s own permissions', async () => {
    const response = await t.http().get(`${base()}/me/permissions`).set(bearer(member));
    expect(response.body).toMatchObject({ role: 'member', isOwner: false, permissions: DEFAULT_PERMISSION_MATRIX.member });
  });

  describe('the owner row is immutable', () => {
    it('through the API', async () => {
      const stepped = await stepUp(t, owner);
      const response = await putPermissions(stepped, await role(owner, 'owner'), DEFAULT_PERMISSION_MATRIX.guest);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('OWNER_IMMUTABLE');
    });

    it('and in the database, whatever the application does', async () => {
      const ownerRole = await role(owner, 'owner');
      const client = await t.appPool.connect();
      try {
        await client.query('begin');
        await client.query(`select set_config('app.workspace_id', $1, true)`, [workspace.id]);
        await expect(
          client.query(`insert into role_permissions (workspace_id, role_id, module, action) values ($1, $2, 'members', 'view')`, [workspace.id, ownerRole.id]),
        ).rejects.toMatchObject({ code: 'TK001' });
        await client.query('rollback');
        await client.query('begin');
        await client.query(`select set_config('app.workspace_id', $1, true)`, [workspace.id]);
        await expect(client.query(`update roles set rank = 3 where id = $1`, [ownerRole.id])).rejects.toMatchObject({ code: 'TK001' });
      } finally {
        await client.query('rollback');
        client.release();
      }
    });
  });

  describe('matrix edits', () => {
    it('need a password step-up', async () => {
      const plain = { ...owner, accessToken: (await t.http().post('/api/v1/auth/refresh')).body.accessToken ?? 'x' };
      const response = await putPermissions(plain, await role(owner, 'guest'), DEFAULT_PERMISSION_MATRIX.guest);
      expect(response.status).toBe(401);
    });

    it('need If-Match, and a current one', async () => {
      const stepped = await stepUp(t, owner);
      const guest = await role(owner, 'guest');
      const missing = await t.http().put(`${base()}/roles/${guest.id}/permissions`).set(bearer(stepped)).send({ permissions: guest.permissions });
      expect(missing.body.code).toBe('PRECONDITION_REQUIRED');
      const stale = await putPermissions(stepped, guest, guest.permissions, guest.version + 7);
      expect(stale.status).toBe(412);
    });

    it('apply to roles below the caller only', async () => {
      const stepped = await stepUp(t, admin);
      const own = await putPermissions(stepped, await role(admin, 'admin'), DEFAULT_PERMISSION_MATRIX.admin);
      expect(own.body.code).toBe('ROLE_RANK_VIOLATION');
      const below = await putPermissions(stepped, await role(admin, 'guest'), DEFAULT_PERMISSION_MATRIX.guest);
      expect(below.status).toBe(200);
    });

    it('cannot grant a cell the caller does not hold (no escalation)', async () => {
      const stepped = await stepUp(t, admin);
      const managerRole = await role(admin, 'manager');
      // Admins lack members:delete by default.
      const escalated: RolePermissions = { ...managerRole.permissions, members: { ...managerRole.permissions.members, delete: true } };
      const response = await putPermissions(stepped, managerRole, escalated);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PRIVILEGE_ESCALATION');
    });

    it('take effect on the very next request', async () => {
      const stepped = await stepUp(t, owner);
      const memberRole = await role(owner, 'member');
      expect((await t.http().get(`${base()}/members`).set(bearer(member))).status).toBe(200);
      const withoutView: RolePermissions = { ...memberRole.permissions, members: { ...memberRole.permissions.members, view: false } };
      expect((await putPermissions(stepped, memberRole, withoutView)).status).toBe(200);
      const denied = await t.http().get(`${base()}/members`).set(bearer(member));
      expect(denied.status).toBe(403);
      // Restore for the tests that follow.
      const restored = await putPermissions(stepped, await role(owner, 'member'), DEFAULT_PERMISSION_MATRIX.member);
      expect(restored.status).toBe(200);
    });

    it('reset to the defaults', async () => {
      const stepped = await stepUp(t, owner);
      const guest = await role(owner, 'guest');
      await putPermissions(stepped, guest, DEFAULT_PERMISSION_MATRIX.member);
      const reset = await t.http().post(`${base()}/roles/reset-defaults`).set(bearer(stepped));
      expect(reset.status).toBe(200);
      for (const entry of reset.body as RoleView[]) expect(entry.permissions).toEqual(DEFAULT_PERMISSION_MATRIX[entry.key]);
    });
  });

  describe('member management follows rank', () => {
    it('an admin cannot promote anyone to admin, nor touch another admin', async () => {
      const stepped = await stepUp(t, admin);
      const promote = await t.http().patch(`${base()}/members/${member.userId}`).set(bearer(stepped)).send({ role: 'admin' });
      expect(promote.body.code).toBe('ROLE_RANK_VIOLATION');
      const other = await addMember(t, owner, workspace.id, 'admin');
      const demote = await t.http().patch(`${base()}/members/${other.userId}`).set(bearer(stepped)).send({ role: 'member' });
      expect(demote.body.code).toBe('ROLE_RANK_VIOLATION');
    });

    it('nobody changes the owner’s role or removes the owner', async () => {
      const stepped = await stepUp(t, admin);
      const change = await t.http().patch(`${base()}/members/${owner.userId}`).set(bearer(stepped)).send({ role: 'member' });
      expect(change.body.code).toBe('OWNER_IMMUTABLE');
      const self = await stepUp(t, owner);
      const remove = await t.http().delete(`${base()}/members/${owner.userId}`).set(bearer(self));
      expect(remove.body.code).toBe('OWNER_IMMUTABLE');
    });

    it('role changes need a step-up; an admin needs a password', async () => {
      const stepped = await stepUp(t, owner);
      const plain = await t.http().patch(`${base()}/members/${member.userId}`).set(bearer(stepped)).send({ role: 'admin' });
      expect(plain.body.code).toBe('PASSWORD_REQUIRED');
      const noStepUp = await t
        .http()
        .patch(`${base()}/members/${member.userId}`)
        .set(bearer({ ...member, accessToken: member.accessToken }))
        .send({ role: 'guest' });
      expect(noStepUp.status).toBe(401);
    });

    it('a manager assigns roles below their own, and a demotion bites at once', async () => {
      const stepped = await stepUp(t, manager);
      const victim = await addMember(t, owner, workspace.id, 'member');
      expect((await t.http().get(`${base()}/departments`).set(bearer(victim))).status).toBe(200);
      const demote = await t.http().patch(`${base()}/members/${victim.userId}`).set(bearer(stepped)).send({ role: 'guest' });
      expect(demote.status).toBe(200);
      expect(demote.body.role).toBe('guest');
      // Guests hold nothing in the members module.
      expect((await t.http().get(`${base()}/departments`).set(bearer(victim))).status).toBe(403);
      const toManager = await t.http().patch(`${base()}/members/${victim.userId}`).set(bearer(stepped)).send({ role: 'manager' });
      expect(toManager.body.code).toBe('ROLE_RANK_VIOLATION');
    });

    it('a removed member loses access immediately (404, not 403)', async () => {
      const stepped = await stepUp(t, owner);
      const leaving = await addMember(t, owner, workspace.id, 'member');
      expect((await t.http().get(base()).set(bearer(leaving))).status).toBe(200);
      expect((await t.http().delete(`${base()}/members/${leaving.userId}`).set(bearer(stepped))).status).toBe(204);
      const after = await t.http().get(base()).set(bearer(leaving));
      expect(after.status).toBe(404);
    });

    it('strangers get 404 for a workspace, never 403', async () => {
      const { owner: stranger } = await ownerWithWorkspace(t, 'دیگری');
      expect((await t.http().get(base()).set(bearer(stranger))).status).toBe(404);
      expect((await t.http().get(`${base()}/members`).set(bearer(stranger))).status).toBe(404);
    });
  });
});
