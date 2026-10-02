import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthSession,
  MeResponse,
  PlanLimits,
  PlatformAuditPage,
  PlatformWorkspaceDetail,
  PlatformWorkspaceModerationResult,
  PlatformWorkspacePage,
  ScheduledMessageView,
  WorkspaceView,
} from '@taskin/contracts';
import { ScheduledMessagesService } from '../../src/modules/chat/scheduled-messages.service.js';
import {
  addMember,
  bearer,
  createTestApp,
  idempotencyKey,
  invite,
  localForm,
  ownerWithWorkspace,
  randomIp,
  randomPhone,
  type Session,
  signIn,
  STRONG_PASSWORD,
  stepUp,
  type TestApp,
  withAdminPassword,
} from './harness.js';
import { createConversation, history, sendRest } from './chat-helpers.js';
import { call, connect, type Connected, next } from './socket-helpers.js';
import { createProject, expectStatus, outboxEvents, wsPath } from './work-helpers.js';

const ADMIN_IP = '192.0.2.77';

interface AuditRow {
  admin_id: string;
  target_user_id: string | null;
  target_workspace_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip: string | null;
  request_id: string | null;
  trace_id: string | null;
  metadata: Record<string, unknown> | null;
}

/** The token of the newest invitation texted to `phone`. */
function smsToken(t: TestApp, phone: string): string {
  const link = [...t.sms.sent].reverse().find((sms) => sms.to === phone && sms.template === 'invite')?.tokens.link;
  const token = link ? new URL(link).searchParams.get('token') : null;
  if (!token) throw new Error('no invitation token');
  return token;
}

describe('Platform super admin (phase 3): workspace moderation, ownership and limits', () => {
  let t: TestApp;
  /** A platform admin, stepped up. */
  let operator: Session;
  /** The same account signed in without a step-up. */
  let operatorFresh: Session;
  const open: Connected[] = [];

  /** An admin request with its own request id, trace and address. */
  const admin = (as: Session) => {
    const send = (method: 'get' | 'post' | 'put', path: string, body?: Record<string, unknown>) => {
      const requestId = `req-${randomBytes(6).toString('hex')}`;
      const traceId = randomBytes(16).toString('hex');
      const request = t
        .http()
        .set('X-Forwarded-For', ADMIN_IP)
        [method](`/api/v1/admin${path}`)
        .set(bearer(as))
        .set('X-Request-Id', requestId)
        .set('traceparent', `00-${traceId}-${randomBytes(8).toString('hex')}-01`);
      return Object.assign(body === undefined ? request : request.send(body), { requestId, traceId });
    };
    return {
      get: (path: string) => send('get', path),
      post: (path: string, body: Record<string, unknown> = {}) => send('post', path, body),
      put: (path: string, body: Record<string, unknown>) => send('put', path, body),
    };
  };
  const result = (response: { body: unknown }) => response.body as PlatformWorkspaceModerationResult;
  const audits = async (action: string, workspaceId: string): Promise<AuditRow[]> =>
    (
      await t.admin.query<AuditRow>(
        `select admin_id, target_user_id, target_workspace_id, action, resource_type, resource_id, host(ip) as ip, request_id, trace_id, metadata
         from platform_audit_logs where action = $1 and target_workspace_id = $2 order by id`,
        [action, workspaceId],
      )
    ).rows;
  const view = (as: Session, workspaceId: string) => t.http().get(wsPath(workspaceId)).set(bearer(as));
  const me = async (as: Session) => {
    const response = await t.http().get('/api/v1/me').set(bearer(as));
    expectStatus(response, 200);
    return response.body as MeResponse;
  };
  const planLimits = async (planId: string) => (await t.admin.query<{ limits: PlanLimits }>('select limits from plans where id = $1', [planId])).rows[0]?.limits;

  beforeAll(async () => {
    t = await createTestApp();
    operatorFresh = await signIn(t, randomPhone(), 'ناظر فضاها');
    operator = await withAdminPassword(t, operatorFresh);
    await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
  });
  afterAll(async () => {
    for (const connected of open) connected.socket.close();
    await t?.close();
  });

  describe('access', () => {
    let owner: Session;
    let workspace: WorkspaceView;
    const actions = (workspaceId: string, userId: string) => [
      (as: Session) => admin(as).post(`/workspaces/${workspaceId}/suspend`, { reason: 'بررسی دسترسی' }),
      (as: Session) => admin(as).post(`/workspaces/${workspaceId}/unsuspend`),
      (as: Session) => admin(as).post(`/workspaces/${workspaceId}/transfer-ownership`, { userId, reason: 'بررسی دسترسی' }),
      (as: Session) => admin(as).put(`/workspaces/${workspaceId}/limits`, { overrides: { maxProjects: 2 }, reason: 'بررسی دسترسی' }),
    ];

    beforeAll(async () => {
      ({ owner, workspace } = await ownerWithWorkspace(t, 'فضای دسترسی'));
    });

    it('does not exist for anyone else, asks an admin for a fresh step-up, and an SMS-confirmed session', async () => {
      const member = await addMember(t, owner, workspace.id, 'member');
      for (const act of actions(workspace.id, member.userId)) {
        const hidden = await act(owner);
        expectStatus(hidden, 404);
        expect(hidden.body).toMatchObject({ code: 'NOT_FOUND' });
        const fresh = await act(operatorFresh);
        expectStatus(fresh, 401);
        expect(fresh.body).toMatchObject({ code: 'STEP_UP_REQUIRED' });
      }
      expectStatus(await t.http().post(`/api/v1/admin/workspaces/${workspace.id}/suspend`).send({ reason: 'بدون ورود' }), 401);

      const login = await t.http().set('X-Forwarded-For', randomIp()).post('/api/v1/auth/password/login').send({ phone: localForm(operator.phone), password: STRONG_PASSWORD });
      expectStatus(login, 200);
      const passwordOnly = await stepUp(t, { ...operator, accessToken: (login.body as AuthSession).accessToken, sessionId: (login.body as AuthSession).sessionId });
      for (const act of actions(workspace.id, member.userId)) expect((await act(passwordOnly)).body).toMatchObject({ code: 'SMS_CONFIRMATION_REQUIRED' });

      const state = (await t.admin.query('select suspended_at, owner_user_id, limit_overrides from workspaces where id = $1', [workspace.id])).rows[0];
      expect(state).toEqual({ suspended_at: null, owner_user_id: owner.userId, limit_overrides: null });
      expect((await t.admin.query('select count(*)::int as n from platform_audit_logs where target_workspace_id = $1', [workspace.id])).rows[0]).toEqual({ n: 0 });
    });

    it('validates every body, and answers 404 for a workspace that is not there', async () => {
      const w = `/workspaces/${workspace.id}`;
      for (const body of [{}, { reason: '  ' }, { reason: 'ab' }, { reason: 'x'.repeat(501) }, { reason: 7 }]) expectStatus(await admin(operator).post(`${w}/suspend`, body), 400);
      expectStatus(await admin(operator).post(`${w}/unsuspend`, { reason: 'x'.repeat(501) }), 400);
      for (const body of [{ reason: 'دلیل کافی' }, { userId: 'nope', reason: 'دلیل کافی' }, { userId: owner.userId }]) {
        expectStatus(await admin(operator).post(`${w}/transfer-ownership`, body), 400);
      }
      for (const body of [
        { overrides: { maxProjects: 2 } },
        { overrides: { maxMembers: 0 }, reason: 'دلیل کافی' },
        { overrides: { maxMembers: null }, reason: 'دلیل کافی' },
        { overrides: { storageBytes: 'many' }, reason: 'دلیل کافی' },
        { overrides: { maxProjects: 1.5 }, reason: 'دلیل کافی' },
        { overrides: { seats: 3 }, reason: 'دلیل کافی' },
        { planId: 'NOT A PLAN', reason: 'دلیل کافی' },
      ]) {
        const response = await admin(operator).put(`${w}/limits`, body);
        expectStatus(response, 400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
      const unknownPlan = await admin(operator).put(`${w}/limits`, { planId: 'platinum', reason: 'دلیل کافی' });
      expectStatus(unknownPlan, 404);
      expectStatus(await admin(operator).post('/workspaces/not-a-uuid/suspend', { reason: 'دلیل کافی' }), 400);

      for (const act of actions(randomUUID(), owner.userId)) expectStatus(await act(operator), 404);
      const { workspace: gone } = await ownerWithWorkspace(t, 'فضای حذف‌شده');
      await t.admin.query("update workspaces set deleted_at = now(), purge_after = now() + interval '30 days' where id = $1", [gone.id]);
      for (const act of actions(gone.id, owner.userId)) expectStatus(await act(operator), 404);
      expect((await t.admin.query("select count(*)::int as n from platform_audit_logs where action like 'admin.workspace.%' and action <> 'admin.workspace.view' and target_workspace_id = any($1)", [[workspace.id, gone.id]])).rows[0]).toEqual({ n: 0 });
    });
  });

  describe('«تعلیق فضای کاری»', () => {
    let owner: Session;
    let workspace: WorkspaceView;
    let other: WorkspaceView;
    let ali: Session;
    let outsider: Session;
    let socket: Connected;
    let groupId: string;
    let scheduled: ScheduledMessageView;
    let inviteePhone: string;
    let suspension: { requestId: string; traceId: string; body: PlatformWorkspaceModerationResult };

    beforeAll(async () => {
      ({ owner, workspace } = await ownerWithWorkspace(t, 'فضای تحت نظارت'));
      const second = await ownerWithWorkspace(t, 'فضای دوم علی');
      other = second.workspace;
      ali = await addMember(t, owner, workspace.id, 'member');
      await addMember(t, second.owner, other.id, 'member', { phone: ali.phone });
      ali = await signIn(t, ali.phone);
      outsider = await signIn(t, randomPhone(), 'غریبه');
      groupId = (await createConversation(t, owner, workspace.id, { kind: 'group', title: 'تیم نظارت', memberIds: [ali.userId] })).id;
      const planned = await t
        .http()
        .post(`${wsPath(workspace.id)}/conversations/${groupId}/scheduled-messages`)
        .set(bearer(ali))
        .send({ clientMsgId: randomUUID(), kind: 'text', text: 'پیام زمان‌بندی‌شده', scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
      expectStatus(planned, 201);
      scheduled = planned.body as ScheduledMessageView;
      inviteePhone = randomPhone();
      await invite(t, owner, workspace.id, [localForm(inviteePhone)]);
      await t.flushNotifications();

      // Warm every cache the suspension must get past: the membership, and a live socket.
      expectStatus(await view(ali, workspace.id), 200);
      socket = await connect(t.baseUrl, ali.accessToken);
      open.push(socket);
      expect(await call(socket.socket, 'workspace:subscribe', { workspaceId: workspace.id })).toMatchObject({ ok: true });

      const request = admin(operator).post(`/workspaces/${workspace.id}/suspend`, { reason: '  محتوای غیرمجاز  ' });
      const response = await request;
      expectStatus(response, 200);
      suspension = { requestId: request.requestId, traceId: request.traceId, body: result(response) };
    });

    it('answers with the suspended workspace', () => {
      expect(suspension.body).toMatchObject({ changed: true, workspace: { id: workspace.id, status: 'suspended', name: 'فضای تحت نظارت' } });
      expect(Date.parse(suspension.body.workspace.suspendedAt ?? '')).toBeGreaterThan(Date.now() - 60_000);
    });

    it('refuses every member at once, with a reason; everyone else still learns nothing', async () => {
      for (const as of [ali, owner]) {
        for (const response of [
          await view(as, workspace.id),
          await t.http().get(`${wsPath(workspace.id)}/members`).set(bearer(as)),
          await t.http().get(`${wsPath(workspace.id)}/conversations`).set(bearer(as)),
          await t.http().post(`${wsPath(workspace.id)}/projects`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send({ name: 'پروژه ممنوع', key: 'NOPE' }),
        ]) {
          expectStatus(response, 403);
          expect(response.body).toMatchObject({ code: 'WORKSPACE_SUSPENDED' });
        }
      }
      const stranger = await view(outsider, workspace.id);
      expectStatus(stranger, 404);
      expect(stranger.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('leaves the same people their other workspaces and their profile', async () => {
      expectStatus(await view(ali, other.id), 200);
      const listed = (await me(ali)).workspaces;
      expect(listed.find((entry) => entry.id === workspace.id)).toMatchObject({ suspended: true });
      expect(listed.find((entry) => entry.id === other.id)).not.toHaveProperty('suspended');
    });

    it('moves open sockets out, and refuses a new subscription', async () => {
      await t.flushNotifications();
      const removed = await next(socket, 'workspace:removed', (envelope) => envelope.data.workspaceId === workspace.id);
      expect(removed.data).toEqual({ workspaceId: workspace.id, reason: 'suspended' });
      expect(await call(socket.socket, 'workspace:subscribe', { workspaceId: workspace.id })).toMatchObject({ ok: false, code: 'WORKSPACE_SUSPENDED' });
      expect(await call(socket.socket, 'workspace:subscribe', { workspaceId: other.id })).toMatchObject({ ok: true });
    });

    it('holds invitations, and fails a scheduled message that falls due, saying why', async () => {
      const invitee = await signIn(t, inviteePhone, 'دعوت‌شده');
      const accepted = await t.http().post('/api/v1/invitations/accept').set(bearer(invitee)).send({ token: smsToken(t, inviteePhone) });
      expectStatus(accepted, 403);
      expect(accepted.body).toMatchObject({ code: 'WORKSPACE_SUSPENDED' });

      await t.admin.query(`update scheduled_messages set scheduled_at = now() - interval '1 second' where id = $1`, [scheduled.id]);
      expect(await t.app.get(ScheduledMessagesService).dispatch(workspace.id, scheduled.id, ali.userId)).toBe('failed');
      const { rows } = await t.admin.query('select status, failure_code from scheduled_messages where id = $1', [scheduled.id]);
      expect(rows).toEqual([{ status: 'failed', failure_code: 'WORKSPACE_SUSPENDED' }]);
    });

    it('records who, which workspace, why, from where, with the request and trace ids', async () => {
      expect(await audits('admin.workspace.suspend', workspace.id)).toEqual([
        {
          admin_id: operator.userId,
          target_user_id: null,
          target_workspace_id: workspace.id,
          action: 'admin.workspace.suspend',
          resource_type: 'workspace',
          resource_id: workspace.id,
          ip: ADMIN_IP,
          request_id: suspension.requestId,
          trace_id: suspension.traceId,
          metadata: { reason: 'محتوای غیرمجاز', changed: true, memberCount: 2 },
        },
      ]);
      // The workspace's own trail has the twin, in the same transaction.
      const twin = await t.admin.query('select workspace_id, actor_user_id, request_id, trace_id from audit_logs where action = $1 and resource_id = $2', [
        'platform.admin.workspace.suspend',
        workspace.id,
      ]);
      expect(twin.rows).toEqual([{ workspace_id: workspace.id, actor_user_id: operator.userId, request_id: suspension.requestId, trace_id: suspension.traceId }]);
    });

    it('shows the suspension in the admin list, detail and audit log', async () => {
      const suspended = (await admin(operator).get(`/workspaces?status=suspended&q=${encodeURIComponent('تحت نظارت')}`)).body as PlatformWorkspacePage;
      expect(suspended.items.map((item) => item.id)).toEqual([workspace.id]);
      expect(suspended.items[0]).toMatchObject({ status: 'suspended' });
      const active = (await admin(operator).get(`/workspaces?status=active&q=${encodeURIComponent('تحت نظارت')}`)).body as PlatformWorkspacePage;
      expect(active.items).toEqual([]);
      expect(((await admin(operator).get(`/workspaces?status=active&q=${encodeURIComponent('دوم علی')}`)).body as PlatformWorkspacePage).items[0]).toMatchObject({ status: 'active', suspendedAt: null });

      const detail = (await admin(operator).get(`/workspaces/${workspace.id}`)).body as PlatformWorkspaceDetail;
      expect(detail.status).toBe('suspended');
      expect(detail.suspension).toMatchObject({ reason: 'محتوای غیرمجاز', adminId: operator.userId, adminName: 'ناظر فضاها' });

      const page = (await admin(operator).get(`/audit?workspaceId=${workspace.id}&action=admin.workspace.suspend`)).body as PlatformAuditPage;
      expect(page.items).toEqual([
        expect.objectContaining({ workspaceId: workspace.id, adminName: 'ناظر فضاها', ip: ADMIN_IP, requestId: suspension.requestId, traceId: suspension.traceId }),
      ]);
      // Filtering by workspace also finds the looks at it (recorded before the column existed).
      const looks = (await admin(operator).get(`/audit?workspaceId=${workspace.id}&action=admin.workspace.view`)).body as PlatformAuditPage;
      expect(looks.items.length).toBeGreaterThan(0);
    });

    it('changes nothing when asked again, but still records it', async () => {
      const again = await admin(operator).post(`/workspaces/${workspace.id}/suspend`, { reason: 'تکرار تعلیق' });
      expectStatus(again, 200);
      expect(result(again)).toMatchObject({ changed: false, workspace: { status: 'suspended' } });
      expect((await audits('admin.workspace.suspend', workspace.id)).map((row) => row.metadata?.changed)).toEqual([true, false]);
      expect(((await admin(operator).get(`/workspaces/${workspace.id}`)).body as PlatformWorkspaceDetail).suspension?.reason).toBe('محتوای غیرمجاز');
    });

    it('lifts the suspension: members, sockets and invitations work again', async () => {
      const lifted = await admin(operator).post(`/workspaces/${workspace.id}/unsuspend`, { reason: 'رفع مشکل محتوا' });
      expectStatus(lifted, 200);
      expect(result(lifted)).toMatchObject({ changed: true, workspace: { status: 'active', suspendedAt: null } });
      for (const as of [ali, owner]) expectStatus(await view(as, workspace.id), 200);
      expect((await me(ali)).workspaces.find((entry) => entry.id === workspace.id)).not.toHaveProperty('suspended');
      expect(await call(socket.socket, 'workspace:subscribe', { workspaceId: workspace.id })).toMatchObject({ ok: true });
      const invitee = await signIn(t, inviteePhone);
      expectStatus(await t.http().post('/api/v1/invitations/accept').set(bearer(invitee)).send({ token: smsToken(t, inviteePhone) }), 200);

      expect((await audits('admin.workspace.unsuspend', workspace.id)).map((row) => row.metadata)).toEqual([{ reason: 'رفع مشکل محتوا', changed: true }]);
      const again = await admin(operator).post(`/workspaces/${workspace.id}/unsuspend`);
      expect(result(again).changed).toBe(false);
      expect(((await admin(operator).get(`/workspaces/${workspace.id}`)).body as PlatformWorkspaceDetail).suspension).toBeNull();
    });
  });

  describe('«انتقال مالکیت»', () => {
    let owner: Session;
    let workspace: WorkspaceView;
    const transfer = (userId: string, reason = 'مالک در دسترس نیست') => admin(operator).post(`/workspaces/${workspace.id}/transfer-ownership`, { userId, reason });
    const roleOf = async (userId: string) =>
      (
        await t.admin.query<{ key: string }>('select r.key from workspace_members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id where m.workspace_id = $1 and m.user_id = $2', [
          workspace.id,
          userId,
        ])
      ).rows[0]?.key;

    beforeAll(async () => {
      ({ owner, workspace } = await ownerWithWorkspace(t, 'فضای انتقال'));
    });

    it('refuses the owner, and anyone who is not an active member with an active account', async () => {
      const already = await transfer(owner.userId);
      expectStatus(already, 409);
      expect(already.body).toMatchObject({ code: 'ALREADY_OWNER' });

      const stranger = await signIn(t, randomPhone(), 'غیرعضو');
      const left = await addMember(t, owner, workspace.id, 'member');
      expectStatus(await t.http().delete(`${wsPath(workspace.id)}/members/${left.userId}`).set(bearer(owner)), 204);
      const suspendedMember = await addMember(t, owner, workspace.id, 'member');
      await t.admin.query("update workspace_members set status = 'suspended' where workspace_id = $1 and user_id = $2", [workspace.id, suspendedMember.userId]);
      const suspendedAccount = await addMember(t, owner, workspace.id, 'member');
      await t.admin.query("update users set status = 'suspended' where id = $1", [suspendedAccount.userId]);
      const deletedAccount = await addMember(t, owner, workspace.id, 'member');
      await t.admin.query("update users set status = 'deleted', deleted_at = now() where id = $1", [deletedAccount.userId]);
      for (const userId of [stranger.userId, randomUUID(), left.userId, suspendedMember.userId, suspendedAccount.userId, deletedAccount.userId]) {
        const refused = await transfer(userId);
        expectStatus(refused, 409);
        expect(refused.body).toMatchObject({ code: 'OWNERSHIP_TARGET_INVALID' });
      }
      expect((await t.admin.query('select owner_user_id from workspaces where id = $1', [workspace.id])).rows[0]).toEqual({ owner_user_id: owner.userId });
      expect(await audits('admin.workspace.transfer_ownership', workspace.id)).toEqual([]);
    });

    it('makes an active member the owner, even without a password, and the previous owner an admin', async () => {
      const heir = await addMember(t, owner, workspace.id, 'member');
      const hasPassword = (await t.admin.query<{ has: boolean }>('select password_hash is not null as has from users where id = $1', [heir.userId])).rows[0]?.has;
      expect(hasPassword).toBe(false);
      const versionBefore = (await t.admin.query<{ v: number }>('select rbac_version as v from workspaces where id = $1', [workspace.id])).rows[0]?.v ?? 0;
      // A membership cached before the transfer must not survive it.
      expectStatus(await view(owner, workspace.id), 200);

      const request = transfer(heir.userId, 'مالک قبلی از شرکت رفته است');
      const response = await request;
      expectStatus(response, 200);
      expect(result(response)).toMatchObject({ changed: true, workspace: { ownerId: heir.userId, ownerName: 'عضو member' } });
      expect(await roleOf(heir.userId)).toBe('owner');
      expect(await roleOf(owner.userId)).toBe('admin');
      expect((await t.admin.query<{ v: number }>('select rbac_version as v from workspaces where id = $1', [workspace.id])).rows[0]?.v).toBeGreaterThan(versionBefore);
      expect((await view(heir, workspace.id)).body).toMatchObject({ ownerId: heir.userId });
      expect((await me(heir)).workspaces.find((entry) => entry.id === workspace.id)).toMatchObject({ isOwner: true, role: 'owner' });
      expect((await me(owner)).workspaces.find((entry) => entry.id === workspace.id)).toMatchObject({ isOwner: false, role: 'admin' });
      expect((await outboxEvents(t, 'rbac.changed', workspace.id)).map((event) => event.payload)).toContainEqual({ workspaceId: workspace.id, userIds: [owner.userId, heir.userId] });

      expect(await audits('admin.workspace.transfer_ownership', workspace.id)).toEqual([
        expect.objectContaining({
          admin_id: operator.userId,
          target_user_id: heir.userId,
          target_workspace_id: workspace.id,
          ip: ADMIN_IP,
          request_id: request.requestId,
          trace_id: request.traceId,
          metadata: { reason: 'مالک قبلی از شرکت رفته است', previousOwnerId: owner.userId, newOwnerHasPassword: false },
        }),
      ]);
      expectStatus(await transfer(heir.userId), 409);
    });
  });

  describe('«سهمیه‌ها و پلن»', () => {
    let owner: Session;
    let workspace: WorkspaceView;
    const setLimits = (body: Record<string, unknown>) => admin(operator).put(`/workspaces/${workspace.id}/limits`, { reason: 'قرارداد ویژه', ...body });
    const limitsSeen = async () => ((await view(owner, workspace.id)).body as WorkspaceView).limits;

    beforeAll(async () => {
      ({ owner, workspace } = await ownerWithWorkspace(t, 'فضای سهمیه'));
    });

    it('holds an unconfigured workspace to its plan exactly', async () => {
      expect(await limitsSeen()).toEqual(await planLimits('free'));
      const detail = (await admin(operator).get(`/workspaces/${workspace.id}`)).body as PlatformWorkspaceDetail;
      expect(detail.quota).toMatchObject({ planId: 'free', overrides: null, effective: await planLimits('free'), usage: { members: 1, storageUsedBytes: 0 } });
      expect(detail.planOptions?.map((plan) => plan.id)).toEqual(expect.arrayContaining(['free', 'team']));
    });

    it('overrides the project limit, and the next project past it is refused', async () => {
      const live = (await t.admin.query<{ n: number }>('select count(*)::int as n from projects where workspace_id = $1 and deleted_at is null', [workspace.id])).rows[0]?.n ?? 0;
      const response = await setLimits({ overrides: { maxProjects: live + 1 } });
      expectStatus(response, 200);
      expect(result(response).changed).toBe(true);
      expect(await limitsSeen()).toEqual({ ...(await planLimits('free')), maxProjects: live + 1 });
      await createProject(t, owner, workspace.id, { name: 'آخرین پروژه مجاز' });
      const refused = await t.http().post(`${wsPath(workspace.id)}/projects`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ name: 'یکی بیشتر', key: 'MORE' });
      expectStatus(refused, 402);
      expect(refused.body).toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
      // `null`: unlimited, beyond what the free plan allows.
      expectStatus(await setLimits({ overrides: { maxProjects: null } }), 200);
      expect((await limitsSeen()).maxProjects).toBeNull();
      await createProject(t, owner, workspace.id, { name: 'پروژه بی‌سقف' });
    });

    it('overrides the seats: an invitation cannot be accepted past them', async () => {
      const seats = (await t.admin.query<{ n: number }>('select member_count as n from workspaces where id = $1', [workspace.id])).rows[0]?.n ?? 1;
      expectStatus(await setLimits({ overrides: { maxMembers: seats } }), 200);
      const phone = randomPhone();
      await invite(t, owner, workspace.id, [localForm(phone)]);
      await t.flushNotifications();
      const invitee = await signIn(t, phone, 'مهمان صندلی');
      const full = await t.http().post('/api/v1/invitations/accept').set(bearer(invitee)).send({ token: smsToken(t, phone) });
      expect(full.body).toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
      expectStatus(await setLimits({ overrides: { maxMembers: seats + 1 } }), 200);
      expectStatus(await t.http().post('/api/v1/invitations/accept').set(bearer(invitee)).send({ token: smsToken(t, phone) }), 200);
    });

    it('overrides the file size and the storage', async () => {
      const plan = (body: Record<string, unknown>) =>
        t.http().post(`${wsPath(workspace.id)}/files/uploads`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ fileName: 'گزارش.pdf', contentType: 'application/pdf', ...body });
      expectStatus(await setLimits({ overrides: { maxFileBytes: 1000 } }), 200);
      const tooBig = await plan({ size: 2000 });
      expect(tooBig.body).toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
      expectStatus(await plan({ size: 900 }), 201);
      expectStatus(await setLimits({ overrides: { maxFileBytes: 1000, storageBytes: 1000 } }), 200);
      expect((await plan({ size: 900 })).body).toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    });

    it('overrides the message history the workspace keeps', async () => {
      const group = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'تاریخچه سهمیه', memberIds: [] });
      const old = await sendRest(t, owner, workspace.id, group.id, { text: 'پیام چهل‌روزه' });
      await sendRest(t, owner, workspace.id, group.id, { text: 'پیام امروز' });
      await t.admin.query(`update messages set created_at = now() - interval '40 days' where id = $1`, [old.id]);
      expect((await history(t, owner, workspace.id, group.id)).items).toHaveLength(2);
      expectStatus(await setLimits({ overrides: { messageHistoryDays: 30 } }), 200);
      expect((await history(t, owner, workspace.id, group.id)).items.map((item) => item.text)).toEqual(['پیام امروز']);
      expectStatus(await setLimits({ overrides: null }), 200);
      expect((await history(t, owner, workspace.id, group.id)).items).toHaveLength(2);
    });

    it('moves the workspace to another plan, keeps the overrides on top, and clears them', async () => {
      const moved = await setLimits({ planId: 'team', overrides: { maxProjects: 7 } });
      expectStatus(moved, 200);
      expect(result(moved).workspace).toMatchObject({ plan: 'تیمی' });
      expect((await view(owner, workspace.id)).body).toMatchObject({ planId: 'team', limits: { ...(await planLimits('team')), maxProjects: 7 } });
      const detail = (await admin(operator).get(`/workspaces/${workspace.id}`)).body as PlatformWorkspaceDetail;
      expect(detail.quota).toMatchObject({ planId: 'team', planName: 'تیمی', overrides: { maxProjects: 7 }, effective: { ...(await planLimits('team')), maxProjects: 7 } });

      // The same again changes nothing, and says so.
      expect(result(await setLimits({ planId: 'team', overrides: { maxProjects: 7 } })).changed).toBe(false);
      // Omitting the overrides keeps them.
      expectStatus(await setLimits({ planId: 'free' }), 200);
      expect((await limitsSeen()).maxProjects).toBe(7);
      expectStatus(await setLimits({ overrides: null }), 200);
      expect(await limitsSeen()).toEqual(await planLimits('free'));
      expect((await t.admin.query('select plan_id, limit_overrides from workspaces where id = $1', [workspace.id])).rows[0]).toEqual({ plan_id: 'free', limit_overrides: null });
    });

    it('records each change with what it was before and after', async () => {
      const rows = await audits('admin.workspace.limits', workspace.id);
      expect(rows.every((row) => row.ip === ADMIN_IP && row.request_id && row.trace_id && row.metadata?.reason === 'قرارداد ویژه')).toBe(true);
      expect(rows.find((row) => (row.metadata?.after as { planId?: string } | undefined)?.planId === 'team')?.metadata).toEqual({
        reason: 'قرارداد ویژه',
        before: { planId: 'free', overrides: null },
        after: { planId: 'team', overrides: { maxProjects: 7 } },
        changed: true,
      });
      expect(rows.at(-1)?.metadata).toMatchObject({ before: { planId: 'free', overrides: { maxProjects: 7 } }, after: { planId: 'free', overrides: null }, changed: true });
    });
  });
});
