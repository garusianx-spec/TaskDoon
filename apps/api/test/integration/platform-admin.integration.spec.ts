import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthSession,
  OtpVerifyResult,
  PasswordResetIssued,
  PlatformAdminMe,
  PlatformAttachmentLink,
  PlatformAuditPage,
  PlatformConversationDetail,
  PlatformConversationView,
  PlatformMessagePage,
  PlatformSessionView,
  PlatformUserDetail,
  PlatformUserPage,
  PlatformWorkspaceDetail,
  PlatformWorkspacePage,
  ProjectView,
  UploadView,
  WorkspaceView,
} from '@taskin/contracts';
import { createApp } from '../../src/bootstrap.js';
import { envSchema } from '../../src/config/env.js';
import {
  addMember,
  bearer,
  createTestApp,
  idempotencyKey,
  lastCode,
  localForm,
  ownerWithWorkspace,
  randomPhone,
  refreshCookies,
  requestOtp,
  type Session,
  signIn,
  STRONG_PASSWORD,
  stepUp,
  type TestApp,
  withAdminPassword,
} from './harness.js';
import { createConversation, sendRest } from './chat-helpers.js';
import { createProject, expectStatus, outboxEvents, putProjectMember, usePlan, wsPath } from './work-helpers.js';

const ORIGIN = 'https://app.taskin.test';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n'), Buffer.alloc(120, 0x20), Buffer.from('%%EOF\n')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 0)]);
const WEBM = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.from('\x42\x86\x81\x01webm\x18\x53\x80\x67Tracks\x86\x86A_OPUS\x63\xa2', 'latin1'),
  Buffer.alloc(200, 0),
]);
const NEW_PASSWORD = 'Tazeh-Ramz-1405!';

interface AuditRow {
  admin_id: string;
  target_user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
}

describe('Platform super admin (phase 1)', () => {
  let t: TestApp;
  /** A platform admin, stepped up. */
  let operator: Session;
  /** The same account signed in without a step-up. */
  let operatorFresh: Session;
  let owner: Session;
  let workspace: WorkspaceView;
  let ownerB: Session;
  let workspaceB: WorkspaceView;
  let ali: Session;
  let sara: Session;
  let project: ProjectView;

  const admin = (as: Session) => ({
    get: (path: string) => t.http().get(`/api/v1/admin${path}`).set(bearer(as)),
    post: (path: string, body: Record<string, unknown> = {}) => t.http().post(`/api/v1/admin${path}`).set(bearer(as)).send(body),
  });
  const audits = async (action: string, where = ''): Promise<AuditRow[]> =>
    (await t.admin.query<AuditRow>(`select admin_id, target_user_id, action, resource_type, resource_id, host(ip) as ip, user_agent, request_id, metadata from platform_audit_logs where action = $1 ${where} order by id`, [action])).rows;

  /** Signs `phone` in from a given device and address, as the session inspector will show it. */
  const signInFrom = async (phone: string, ip: string, userAgent: string): Promise<Session> => {
    const challenge = await requestOtp(t, phone);
    const client = t.http().set('X-Forwarded-For', ip).set('User-Agent', userAgent);
    const verify = await client.post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code: lastCode(t, phone) });
    expectStatus(verify, 200);
    const result = verify.body as OtpVerifyResult;
    if (result.status !== 'signed_in') throw new Error('expected an existing account');
    const session: Session = { userId: result.session.user.id, phone, accessToken: result.session.accessToken, sessionId: result.session.sessionId, cookies: '', csrf: '' };
    refreshCookies(session, verify.headers['set-cookie']);
    return session;
  };
  const refresh = (session: Session, ip: string) =>
    t.http().set('X-Forwarded-For', ip).post('/api/v1/auth/refresh').set('Cookie', session.cookies).set('X-CSRF-Token', session.csrf).set('Origin', ORIGIN);

  const upload = async (as: Session, fileName: string, bytes: Buffer, contentType: string): Promise<string> => {
    const planned = await t.http().post(`${wsPath(workspace.id)}/files/uploads`).set(bearer(as)).set('Idempotency-Key', idempotencyKey()).send({ fileName, size: bytes.length, contentType });
    expectStatus(planned, 201);
    const plan = (planned.body as UploadView).plan;
    if (plan.kind !== 'post') throw new Error('expected a POST plan');
    const form = new FormData();
    for (const [name, value] of Object.entries(plan.fields)) form.append(name, value);
    form.append('Content-Type', contentType);
    form.append('file', new Blob([bytes], { type: contentType }), 'upload');
    expect((await fetch(plan.url, { method: 'POST', body: form })).status).toBeLessThan(300);
    const id = (planned.body as UploadView).attachment.id;
    expectStatus(await t.http().post(`${wsPath(workspace.id)}/files/uploads/${id}/complete`).set(bearer(as)).send({}), 200);
    await t.flushNotifications();
    return id;
  };

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t, 'هلدینگ راهنما'));
    ({ owner: ownerB, workspace: workspaceB } = await ownerWithWorkspace(t, 'استودیو پارس'));
    await usePlan(t, workspace.id, 'team');
    ali = await addMember(t, owner, workspace.id, 'member');
    await addMember(t, ownerB, workspaceB.id, 'manager', { phone: ali.phone });
    sara = await addMember(t, owner, workspace.id, 'member');
    project = await createProject(t, owner, workspace.id, { name: 'پرتال مشتریان' });
    await putProjectMember(t, owner, workspace.id, project.id, ali.userId, 'contributor');

    operatorFresh = await signIn(t, randomPhone(), 'اپراتور پلتفرم');
    operator = await withAdminPassword(t, operatorFresh);
    await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('access', () => {
    const routes = (userId: string, id: string): readonly (readonly ['get' | 'post', string])[] => [
      ['get', '/me'],
      ['get', '/users'],
      ['get', `/users/${userId}`],
      ['get', `/users/${userId}/sessions`],
      ['post', `/sessions/${id}/revoke`],
      ['post', `/users/${userId}/sessions/revoke-all`],
      ['post', `/users/${userId}/password-reset`],
      ['get', `/users/${userId}/conversations`],
      ['get', `/conversations/${id}`],
      ['get', `/conversations/${id}/messages`],
      ['get', `/attachments/${id}/link`],
      ['get', '/audit'],
      ['get', '/workspaces'],
      ['get', `/workspaces/${id}`],
    ];

    it('does not exist for anyone else: 404 on every route, even for a stepped-up workspace owner', async () => {
      for (const [method, path] of routes(ali.userId, workspace.id)) {
        const response = await admin(owner)[method](path);
        expectStatus(response, 404);
        expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
      }
      for (const [method, path] of routes(ali.userId, workspace.id)) expectStatus(await t.http()[method](`/api/v1/admin${path}`), 401);
      // Nothing was served, so nothing was recorded.
      expect((await t.admin.query('select count(*)::int as n from platform_audit_logs where admin_id = $1', [owner.userId])).rows[0]).toEqual({ n: 0 });
    });

    it('asks for a fresh password step-up on everything but the probe', async () => {
      const probe = await admin(operatorFresh).get('/me');
      expectStatus(probe, 200);
      expect(probe.body).toEqual({ userId: operator.userId, fullName: 'اپراتور پلتفرم', smsConfirmationRequired: false, stepUpRequired: true, available: true } satisfies PlatformAdminMe);
      expect(probe.headers['cache-control']).toBe('no-store');
      for (const [method, path] of routes(ali.userId, workspace.id).filter(([, path]) => path !== '/me')) {
        const response = await admin(operatorFresh)[method](path);
        expectStatus(response, 401);
        expect(response.body).toMatchObject({ code: 'STEP_UP_REQUIRED' });
      }
      expect(((await admin(operator).get('/me')).body as PlatformAdminMe).stepUpRequired).toBe(false);
      expectStatus(await admin(operator).get('/users'), 200);
    });

    it('stops at once when the flag is taken away', async () => {
      await t.admin.query('update users set is_platform_admin = false where id = $1', [operator.userId]);
      try {
        expectStatus(await admin(operator).get('/me'), 404);
        expectStatus(await admin(operator).get('/users'), 404);
      } finally {
        await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
      }
      expectStatus(await admin(operator).get('/me'), 200);
    });

    it('answers 503 on a deployment without the admin database role, and the probe says so', async () => {
      const settings = Object.fromEntries(Object.entries(t.settings).filter(([key]) => key !== 'DATABASE_PLATFORM_ADMIN_URL'));
      const peer: NestExpressApplication = await createApp(envSchema.parse(settings), { logDestination: new Writable({ write: (_chunk, _encoding, done) => done() }) });
      await peer.listen(0, '127.0.0.1');
      try {
        const address = peer.getHttpServer().address();
        const http = supertest(typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '');
        const probe = await http.get('/api/v1/admin/me').set(bearer(operator));
        expectStatus(probe, 200);
        expect((probe.body as PlatformAdminMe).available).toBe(false);
        const users = await http.get('/api/v1/admin/users').set(bearer(operator));
        expectStatus(users, 503);
        expect(users.body).toMatchObject({ code: 'PLATFORM_ADMIN_UNAVAILABLE' });
      } finally {
        await peer.close();
      }
    });

    it('answers 503, not 500, when the admin role cannot log in, and the probe says so', async () => {
      // A database created before the role existed: Postgres answers 28P01 for a role it does not know.
      const url = new URL(t.settings.DATABASE_PLATFORM_ADMIN_URL ?? '');
      url.password = 'not-the-password';
      const peer: NestExpressApplication = await createApp(envSchema.parse({ ...t.settings, DATABASE_PLATFORM_ADMIN_URL: url.toString() }), {
        logDestination: new Writable({ write: (_chunk, _encoding, done) => done() }),
      });
      await peer.listen(0, '127.0.0.1');
      try {
        const address = peer.getHttpServer().address();
        const http = supertest(typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '');
        const probe = await http.get('/api/v1/admin/me').set(bearer(operator));
        expectStatus(probe, 200);
        expect((probe.body as PlatformAdminMe).available).toBe(false);
        for (const path of ['/users', '/workspaces', '/audit']) {
          const response = await http.get(`/api/v1/admin${path}`).set(bearer(operator));
          expectStatus(response, 503);
          expect(response.body).toMatchObject({ code: 'PLATFORM_ADMIN_UNAVAILABLE' });
        }
      } finally {
        await peer.close();
      }
    });

    it('holds a session opened with a password until it is confirmed with an SMS code', async () => {
      const login = await t.http().post('/api/v1/auth/password/login').send({ phone: localForm(operator.phone), password: STRONG_PASSWORD });
      expectStatus(login, 200);
      const passwordOnly: Session = { ...operator, accessToken: (login.body as AuthSession).accessToken, sessionId: (login.body as AuthSession).sessionId };
      const probe = await admin(passwordOnly).get('/me');
      expectStatus(probe, 200);
      expect(probe.body).toMatchObject({ smsConfirmationRequired: true, stepUpRequired: true });
      // Before the step-up, and even after it.
      expect((await admin(passwordOnly).get('/users')).body).toMatchObject({ code: 'SMS_CONFIRMATION_REQUIRED' });
      const steppedUp = await stepUp(t, passwordOnly);
      const refused = await admin(steppedUp).get('/users');
      expectStatus(refused, 401);
      expect(refused.body).toMatchObject({ code: 'SMS_CONFIRMATION_REQUIRED' });

      await t.redis.del(`${t.env.REDIS_PREFIX}:otp:send:phone:${operator.phone}:cooldown`);
      const challenge = await t.http().post('/api/v1/auth/otp/confirm/request').set(bearer(steppedUp));
      expectStatus(challenge, 200);
      const confirmed = await t
        .http()
        .post('/api/v1/auth/otp/confirm')
        .set(bearer(steppedUp))
        .send({ challengeId: (challenge.body as { challengeId: string }).challengeId, code: lastCode(t, operator.phone) });
      expectStatus(confirmed, 200);
      const ready: Session = { ...steppedUp, accessToken: (confirmed.body as AuthSession).accessToken };
      expect((await admin(ready).get('/me')).body).toMatchObject({ smsConfirmationRequired: false, stepUpRequired: false });
      expectStatus(await admin(ready).get('/users'), 200);
    });

    it('adds nothing to what members see about themselves', async () => {
      const me = await t.http().get('/api/v1/me').set(bearer(operator));
      expectStatus(me, 200);
      expect(JSON.stringify(me.body)).not.toMatch(/platform/i);
    });
  });

  describe('the administrative unit of work', () => {
    const adminPool = () => new pg.Pool({ connectionString: t.settings.DATABASE_PLATFORM_ADMIN_URL, max: 1 });

    it('reads across every workspace without a tenant setting, but can never write', async () => {
      const pool = adminPool();
      try {
        const { rows } = await pool.query<{ id: string }>('select id from workspaces where id = any($1) order by id', [[workspace.id, workspaceB.id]]);
        expect(rows).toHaveLength(2);
        await expect(pool.query("update users set full_name = 'x' where id = $1", [ali.userId])).rejects.toThrow(/read-only transaction/);
        await expect(pool.query("insert into platform_audit_logs (admin_id, action) values ($1, 'x')", [operator.userId])).rejects.toThrow(/read-only transaction/);
        // Even inside an explicit read-write transaction the role has no write grants.
        const client = await pool.connect();
        try {
          await client.query('begin read write');
          await expect(client.query("update users set full_name = 'x' where id = $1", [ali.userId])).rejects.toThrow(/permission denied/);
        } finally {
          await client.query('rollback');
          client.release();
        }
      } finally {
        await pool.end();
      }
    });

    it('sees only the tables the admin screens show', async () => {
      const pool = adminPool();
      try {
        await expect(pool.query('select count(*) from notes')).rejects.toThrow(/permission denied/);
        await expect(pool.query('select title from tasks limit 1')).rejects.toThrow(/permission denied/);
        await expect(pool.query('select count(*) from refresh_tokens')).rejects.toThrow(/permission denied/);
        await expect(pool.query('select count(*) from password_reset_tokens')).rejects.toThrow(/permission denied/);
        await expect(pool.query('select password_hash from users limit 1')).resolves.toBeDefined();
      } finally {
        await pool.end();
      }
    });

    it('keeps the platform audit log append-only for the API role', async () => {
      await expect(t.appPool.query('update platform_audit_logs set action = action')).rejects.toThrow(/permission denied/);
      await expect(t.appPool.query('delete from platform_audit_logs')).rejects.toThrow(/permission denied/);
    });
  });

  describe('«کاربران و سشن‌ها»', () => {
    it('finds people by name, phone, email, status and platform role, a page at a time', async () => {
      await t.admin.query("update users set email = 'ali.rahimi@example.com' where id = $1", [ali.userId]);
      const find = async (query: string) => {
        const response = await admin(operator).get(`/users?${query}`);
        expectStatus(response, 200);
        return response.body as PlatformUserPage;
      };
      expect((await find(`phone=${encodeURIComponent(localForm(ali.phone))}`)).items.map((user) => user.id)).toEqual([ali.userId]);
      expect((await find(`phone=${ali.phone.slice(-7)}`)).items.map((user) => user.id)).toEqual([ali.userId]);
      expect((await find(`q=${ali.phone.slice(-7)}`)).items.map((user) => user.id)).toEqual([ali.userId]);
      expect((await find('email=ALI.RAHIMI')).items.map((user) => user.id)).toEqual([ali.userId]);
      expect((await find(`q=${encodeURIComponent('اپراتور')}`)).items.map((user) => user.id)).toEqual([operator.userId]);
      expect((await find('platformRole=admin')).items.map((user) => user.id)).toEqual([operator.userId]);
      expect((await find('platformRole=user')).items.map((user) => user.id)).not.toContain(operator.userId);

      await t.admin.query("update users set status = 'suspended' where id = $1", [sara.userId]);
      try {
        expect((await find('status=suspended')).items.map((user) => user.id)).toEqual([sara.userId]);
      } finally {
        await t.admin.query("update users set status = 'active' where id = $1", [sara.userId]);
      }

      const found = (await find(`phone=${encodeURIComponent(localForm(ali.phone))}`)).items[0];
      expect(found).toMatchObject({ fullName: 'عضو member', phone: ali.phone, email: 'ali.rahimi@example.com', status: 'active', isPlatformAdmin: false, workspaceCount: 2 });
      expect(found?.activeSessionCount).toBeGreaterThanOrEqual(2);

      const first = await find('limit=2');
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toBeTruthy();
      const second = await find(`limit=2&cursor=${first.nextCursor}`);
      expect(second.items.map((user) => user.id)).not.toContain(first.items[0]?.id);
      expectStatus(await admin(operator).get('/users?cursor=bm9wZQ'), 400);

      const [searched] = (await audits('admin.users.search', `and metadata #>> '{filters,email}' = 'ALI.RAHIMI'`)).slice(-1);
      expect(searched).toMatchObject({ admin_id: operator.userId, ip: '203.0.113.10', metadata: { results: 1 } });
      expect(searched?.request_id).toBeTruthy();
    });

    it('shows a person’s workspaces with their exact roles and projects', async () => {
      const response = await admin(operator).get(`/users/${ali.userId}`);
      expectStatus(response, 200);
      const detail = response.body as PlatformUserDetail;
      expect(detail).toMatchObject({ id: ali.userId, hasPassword: false, passwordResetRequired: false });
      const byWorkspace = new Map(detail.memberships.map((membership) => [membership.workspaceId, membership]));
      expect(byWorkspace.get(workspace.id)).toMatchObject({
        workspaceName: 'هلدینگ راهنما',
        roleKey: 'member',
        roleName: 'عضو تیم',
        isOwner: false,
        memberStatus: 'active',
        projects: [{ id: project.id, key: project.key, name: 'پرتال مشتریان', role: 'contributor' }],
      });
      expect(byWorkspace.get(workspaceB.id)).toMatchObject({ workspaceName: 'استودیو پارس', roleKey: 'manager', roleName: 'مدیر پروژه', projects: [] });

      const owned = (await admin(operator).get(`/users/${owner.userId}`)).body as PlatformUserDetail;
      expect(owned.memberships).toEqual([expect.objectContaining({ workspaceId: workspace.id, roleKey: 'owner', isOwner: true })]);
      expect(owned.hasPassword).toBe(true);

      expect(await audits('admin.user.view', `and target_user_id = '${ali.userId}'`)).toEqual([
        expect.objectContaining({ admin_id: operator.userId, resource_type: 'user', resource_id: ali.userId, ip: '203.0.113.10' }),
      ]);
      expectStatus(await admin(operator).get(`/users/${workspace.id}`), 404);
    });

    it('inspects sessions: device, client, IP behind the proxy, last address, activity and status', async () => {
      const phone = await signInFrom(ali.phone, '198.51.100.7', ANDROID_CHROME);
      const laptop = await signInFrom(ali.phone, '198.51.100.8', MAC_SAFARI);
      const rotated = await refresh(phone, '198.51.100.99');
      expectStatus(rotated, 200);

      const response = await admin(operator).get(`/users/${ali.userId}/sessions`);
      expectStatus(response, 200);
      const sessions = response.body as PlatformSessionView[];
      const phoneView = sessions.find((session) => session.id === phone.sessionId);
      expect(phoneView).toMatchObject({
        status: 'active',
        client: 'Chrome 128',
        os: 'Android 14',
        deviceType: 'mobile',
        ip: '198.51.100.7',
        lastIp: '198.51.100.99',
        userAgent: ANDROID_CHROME,
        amr: ['otp'],
        revokedAt: null,
      });
      expect(Date.parse(phoneView?.lastActiveAt ?? '')).toBeGreaterThanOrEqual(Date.parse(phoneView?.createdAt ?? ''));
      expect(Date.parse(phoneView?.expiresAt ?? '')).toBeGreaterThan(Date.now());
      expect(sessions.find((session) => session.id === laptop.sessionId)).toMatchObject({ client: 'Safari 17.5', os: 'macOS', deviceType: 'desktop', ip: '198.51.100.8', lastIp: null });
      expect(await audits('admin.sessions.view', `and target_user_id = '${ali.userId}'`)).toHaveLength(1);
    });

    it('ends one session: its tokens and refresh stop working, the gateway is told', async () => {
      const victim = await signInFrom(ali.phone, '198.51.100.20', ANDROID_CHROME);
      const bystander = await signInFrom(ali.phone, '198.51.100.21', MAC_SAFARI);
      expectStatus(await t.http().get('/api/v1/me').set(bearer(victim)), 200);

      expectStatus(await admin(operator).post(`/sessions/${victim.sessionId}/revoke`), 204);
      expectStatus(await t.http().get('/api/v1/me').set(bearer(victim)), 401);
      expectStatus(await refresh(victim, '198.51.100.20'), 401);
      expectStatus(await t.http().get('/api/v1/me').set(bearer(bystander)), 200);
      expect((await outboxEvents(t, 'session.revoked', ali.userId)).map((event) => event.payload)).toContainEqual({
        userId: ali.userId,
        sessionIds: [victim.sessionId],
        reason: 'admin_action',
      });
      const revoked = (await admin(operator).get(`/users/${ali.userId}/sessions?status=revoked`)).body as PlatformSessionView[];
      expect(revoked.find((session) => session.id === victim.sessionId)).toMatchObject({ status: 'revoked', revokeReason: 'admin_action' });
      const active = (await admin(operator).get(`/users/${ali.userId}/sessions?status=active`)).body as PlatformSessionView[];
      expect(active.map((session) => session.id)).not.toContain(victim.sessionId);
      expect(active.map((session) => session.id)).toContain(bystander.sessionId);

      expect(await audits('admin.session.revoke', `and resource_id = '${victim.sessionId}'`)).toEqual([
        expect.objectContaining({ admin_id: operator.userId, target_user_id: ali.userId, resource_type: 'session' }),
      ]);
      // The ordinary audit trail has it too, with the request's correlation ids.
      const { rows } = await t.admin.query("select actor_user_id, request_id, trace_id from audit_logs where action = 'platform.admin.session.revoke' and resource_id = $1", [victim.sessionId]);
      expect(rows).toEqual([expect.objectContaining({ actor_user_id: operator.userId, request_id: expect.any(String), trace_id: expect.any(String) })]);
      expectStatus(await admin(operator).post(`/sessions/${workspace.id}/revoke`), 404);
    });

    it('ends every session of a person', async () => {
      const one = await signInFrom(sara.phone, '198.51.100.30', ANDROID_CHROME);
      const two = await signInFrom(sara.phone, '198.51.100.31', MAC_SAFARI);
      const response = await admin(operator).post(`/users/${sara.userId}/sessions/revoke-all`);
      expectStatus(response, 200);
      expect((response.body as { revoked: number }).revoked).toBeGreaterThanOrEqual(2);
      for (const session of [one, two, sara]) expectStatus(await t.http().get('/api/v1/me').set(bearer(session)), 401);
      const active = (await admin(operator).get(`/users/${sara.userId}/sessions?status=active`)).body as PlatformSessionView[];
      expect(active).toEqual([]);
      expect(await audits('admin.sessions.revoke_all', `and target_user_id = '${sara.userId}'`)).toEqual([
        expect.objectContaining({ metadata: { revoked: (response.body as { revoked: number }).revoked } }),
      ]);
      sara = await signIn(t, sara.phone);
    });
  });

  describe('«رصد پیام‌ها و گروه‌ها»', () => {
    let group: string;
    let channel: string;
    let direct: string;
    let left: string;
    let imageId: string;

    beforeAll(async () => {
      const aliNow = await signIn(t, ali.phone);
      ali = aliNow;
      group = (await createConversation(t, owner, workspace.id, { kind: 'group', title: 'تیم فروش', memberIds: [ali.userId, sara.userId] })).id;
      channel = (await createConversation(t, owner, workspace.id, { kind: 'channel', title: 'اطلاعیه‌ها', isPrivate: true, memberIds: [ali.userId] })).id;
      direct = (await createConversation(t, ali, workspace.id, { kind: 'direct', userId: sara.userId })).id;
      left = (await createConversation(t, owner, workspace.id, { kind: 'group', title: 'پروژه قدیمی', memberIds: [ali.userId] })).id;
      expectStatus(await t.http().delete(`${wsPath(workspace.id)}/conversations/${left}/members/${ali.userId}`).set(bearer(ali)), 204);

      await sendRest(t, ali, workspace.id, group, { text: 'سلام، گزارش فروش آماده است' });
      await sendRest(t, sara, workspace.id, group, { text: 'ممنون، بررسی می‌کنم' });
      const voiceId = await upload(ali, 'voice.webm', WEBM, 'audio/webm;codecs=opus');
      await sendRest(t, ali, workspace.id, group, { kind: 'voice', attachmentId: voiceId, durationSec: 3, waveform: [10, 40, 80] });
      imageId = await upload(ali, 'نمودار.png', PNG, 'image/png');
      await sendRest(t, ali, workspace.id, group, { kind: 'file', attachmentId: imageId });
      const pdfId = await upload(sara, 'قرارداد.pdf', PDF, 'application/pdf');
      await sendRest(t, sara, workspace.id, group, { kind: 'file', attachmentId: pdfId, text: 'نسخه نهایی' });
      const removed = await sendRest(t, ali, workspace.id, group, { text: 'این پیام حذف می‌شود' });
      expectStatus(await t.http().delete(`${wsPath(workspace.id)}/conversations/${group}/messages/${removed.id}`).set(bearer(ali)), 204);
      await sendRest(t, sara, workspace.id, direct, { text: 'پیام خصوصی' });
      // One message from last month, for the date filter.
      await t.admin.query("update messages set created_at = now() - interval '30 days' where conversation_id = $1 and seq = 1", [group]);
    });

    it('lists every conversation a person is or was in, across kinds', async () => {
      const response = await admin(operator).get(`/users/${ali.userId}/conversations`);
      expectStatus(response, 200);
      const list = response.body as PlatformConversationView[];
      const byId = new Map(list.map((conversation) => [conversation.id, conversation]));
      expect(byId.get(group)).toMatchObject({ kind: 'group', title: 'تیم فروش', workspaceId: workspace.id, workspaceName: 'هلدینگ راهنما', memberCount: 3, role: 'member', leftAt: null, messageCount: 6 });
      expect(byId.get(channel)).toMatchObject({ kind: 'channel', title: 'اطلاعیه‌ها', isPrivate: true });
      expect(byId.get(direct)).toMatchObject({ kind: 'direct', title: 'عضو member و عضو member', memberCount: 2 });
      expect(byId.get(left)?.leftAt).not.toBeNull();
      // The project's own channel, synced with its members.
      expect(list.find((conversation) => conversation.projectId === project.id)).toMatchObject({ kind: 'channel', membershipMode: 'project_synced', projectName: 'پرتال مشتریان' });
      expect(await audits('admin.conversations.list', `and target_user_id = '${ali.userId}'`)).toHaveLength(1);
    });

    it('shows a conversation with its members, left ones included', async () => {
      const response = await admin(operator).get(`/conversations/${left}?targetUserId=${ali.userId}`);
      expectStatus(response, 200);
      const detail = response.body as PlatformConversationDetail;
      expect(detail.members.find((member) => member.userId === ali.userId)?.leftAt).not.toBeNull();
      expect(await audits('admin.conversation.view', `and resource_id = '${left}'`)).toEqual([expect.objectContaining({ target_user_id: ali.userId })]);
      expectStatus(await admin(operator).get(`/conversations/${workspace.id}`), 404);
    });

    it('reads messages with filters by type, sender and date, a page at a time', async () => {
      const read = async (query = '') => {
        const response = await admin(operator).get(`/conversations/${group}/messages?targetUserId=${ali.userId}${query}`);
        expectStatus(response, 200);
        return response.body as PlatformMessagePage;
      };
      const all = await read();
      expect(all.items.map((message) => message.seq)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(all.olderBeforeSeq).toBeNull();
      expect(all.authors).toEqual({ [ali.userId]: 'عضو member', [sara.userId]: 'عضو member' });
      const deleted = all.items.at(-1);
      expect(deleted).toMatchObject({ deleted: true, text: null });

      expect((await read('&type=text')).items.map((message) => message.seq)).toEqual([1, 2, 6]);
      expect((await read('&type=voice')).items.map((message) => message.kind)).toEqual(['voice']);
      expect((await read('&type=image')).items.map((message) => message.attachment?.id)).toEqual([imageId]);
      expect((await read('&type=file')).items.map((message) => message.attachment?.name)).toEqual(['قرارداد.pdf']);
      expect((await read(`&senderId=${sara.userId}`)).items.map((message) => message.seq)).toEqual([2, 5]);
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      expect((await read(`&from=${weekAgo}`)).items.map((message) => message.seq)).toEqual([2, 3, 4, 5, 6]);
      expect((await read(`&to=${weekAgo}`)).items.map((message) => message.seq)).toEqual([1]);

      const newest = await read('&limit=4');
      expect(newest.items.map((message) => message.seq)).toEqual([3, 4, 5, 6]);
      expect(newest.olderBeforeSeq).toBe(3);
      expect((await read(`&limit=4&beforeSeq=${newest.olderBeforeSeq}`)).items.map((message) => message.seq)).toEqual([1, 2]);
      expectStatus(await admin(operator).get(`/conversations/${group}/messages?type=sticker`), 400);

      const reads = await audits('admin.messages.read', `and resource_id = '${group}'`);
      expect(reads.length).toBeGreaterThanOrEqual(10);
      expect(reads.find((row) => (row.metadata?.filters as Record<string, unknown>).type === 'voice')).toMatchObject({
        admin_id: operator.userId,
        target_user_id: ali.userId,
        resource_type: 'conversation',
        ip: '203.0.113.10',
        metadata: { workspaceId: workspace.id, results: 1 },
      });
      // Contents are never copied into the log.
      expect(JSON.stringify(reads)).not.toContain('گزارش فروش');
    });

    it('opens a sent file with a short-lived link', async () => {
      const response = await admin(operator).get(`/attachments/${imageId}/link?targetUserId=${ali.userId}`);
      expectStatus(response, 200);
      const link = response.body as PlatformAttachmentLink;
      expect(Date.parse(link.expiresAt) - Date.now()).toBeLessThanOrEqual(300_000);
      const image = await fetch(link.url);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toBe('image/png');
      expect(await audits('admin.attachment.open', `and resource_id = '${imageId}'`)).toEqual([expect.objectContaining({ target_user_id: ali.userId })]);
      expectStatus(await admin(operator).get(`/attachments/${workspace.id}/link`), 404);
    });
  });

  describe('«ورک‌اسپیس‌ها و نقش‌ها» and the audit log', () => {
    it('lists workspaces and shows roles with their matrix and holders', async () => {
      const page = (await admin(operator).get(`/workspaces?q=${encodeURIComponent('استودیو')}`)).body as PlatformWorkspacePage;
      expect(page.items.map((item) => item.id)).toEqual([workspaceB.id]);
      expect(page.items[0]).toMatchObject({ name: 'استودیو پارس', ownerId: ownerB.userId, ownerName: 'مالک فضای کاری', memberCount: 2 });

      const response = await admin(operator).get(`/workspaces/${workspace.id}`);
      expectStatus(response, 200);
      const detail = response.body as PlatformWorkspaceDetail;
      expect(detail.roles.map((role) => role.key)).toEqual(['owner', 'admin', 'manager', 'member', 'guest']);
      const ownerRole = detail.roles.find((role) => role.key === 'owner');
      expect(ownerRole).toMatchObject({ name: 'مالک سازمان', memberCount: 1 });
      expect(ownerRole?.grants).toContain('members:delete');
      expect(detail.roles.find((role) => role.key === 'member')?.memberCount).toBe(2);
      expect(detail.members.find((member) => member.userId === ali.userId)).toMatchObject({ roleKey: 'member', roleName: 'عضو تیم', status: 'active', isOwner: false });
      expect(await audits('admin.workspace.view', `and resource_id = '${workspace.id}'`)).toHaveLength(1);
    });

    it('shows who looked at what, filtered by person and action', async () => {
      const page = (await admin(operator).get(`/audit?targetUserId=${ali.userId}&action=admin.messages`)).body as PlatformAuditPage;
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items.every((entry) => entry.action === 'admin.messages.read' && entry.targetUserId === ali.userId)).toBe(true);
      expect(page.items[0]).toMatchObject({ adminId: operator.userId, adminName: 'اپراتور پلتفرم', targetName: 'عضو member', ip: '203.0.113.10' });
      const first = (await admin(operator).get('/audit?limit=2')).body as PlatformAuditPage;
      const second = (await admin(operator).get(`/audit?limit=2&cursor=${first.nextCursor}`)).body as PlatformAuditPage;
      expect(Math.max(...second.items.map((entry) => entry.id))).toBeLessThan(Math.min(...first.items.map((entry) => entry.id)));
    });
  });

  describe('password reset', () => {
    let member: Session;

    beforeAll(async () => {
      member = await withAdminPassword(t, await signIn(t, randomPhone(), 'مدیر بازنشانی'));
    });

    it('issues a single-use code once, stores only its hash, and retires the old password', async () => {
      const response = await admin(operator).post(`/users/${member.userId}/password-reset`, { channel: 'manual' });
      expectStatus(response, 201);
      expect(response.headers['cache-control']).toBe('no-store');
      const issued = response.body as PasswordResetIssued;
      expect(issued).toMatchObject({ channel: 'manual', sentTo: null });
      expect(issued.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(issued.link).toBe(`${ORIGIN}/reset-password?token=${issued.code}`);

      const stored = await t.admin.query<{ token_hash: Buffer; used_at: Date | null }>('select token_hash, used_at from password_reset_tokens where user_id = $1', [member.userId]);
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0]?.token_hash.equals(createHash('sha256').update(issued.code ?? '').digest())).toBe(true);
      expect(JSON.stringify(await audits('admin.password_reset.issue'))).not.toContain(issued.code ?? '');
      expect(JSON.stringify((await t.admin.query('select changes from audit_logs where action = $1', ['platform.admin.password_reset.issue'])).rows)).not.toContain(issued.code ?? '');

      const old = await t.http().post('/api/v1/auth/step-up').set(bearer(member)).send({ password: STRONG_PASSWORD });
      expectStatus(old, 409);
      expect(old.body).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });
      expect(((await admin(operator).get(`/users/${member.userId}`)).body as PlatformUserDetail).passwordResetRequired).toBe(true);

      const weak = await t.http().post('/api/v1/password-reset').send({ token: issued.code, newPassword: 'short' });
      expectStatus(weak, 400);
      expectStatus(await t.http().post('/api/v1/password-reset').send({ token: issued.code, newPassword: NEW_PASSWORD }), 204);
      // Every session of the account ended, as after any password change; its owner was told.
      expectStatus(await t.http().get('/api/v1/me').set(bearer(member)), 401);
      expect((await outboxEvents(t, 'notification.sms', member.userId)).some((event) => event.payload.template === 'alert')).toBe(true);
      const { rows } = await t.admin.query("select actor_user_id from audit_logs where action = 'auth.password.reset' and resource_id = $1", [member.userId]);
      expect(rows).toEqual([{ actor_user_id: member.userId }]);

      member = await signIn(t, member.phone);
      member = await stepUp(t, member, NEW_PASSWORD);
      expectStatus(await t.http().get('/api/v1/me').set(bearer(member)), 200);
      const reused = await t.http().post('/api/v1/password-reset').send({ token: issued.code, newPassword: 'Yek-Ramz-Digar-2' });
      expectStatus(reused, 410);
      expect(reused.body).toMatchObject({ code: 'RESET_TOKEN_INVALID' });
    });

    it('refuses an expired or superseded code', async () => {
      const first = (await admin(operator).post(`/users/${member.userId}/password-reset`, { channel: 'manual' })).body as PasswordResetIssued;
      const second = (await admin(operator).post(`/users/${member.userId}/password-reset`, { channel: 'manual' })).body as PasswordResetIssued;
      expectStatus(await t.http().post('/api/v1/password-reset').send({ token: first.code, newPassword: NEW_PASSWORD }), 410);
      await t.admin.query("update password_reset_tokens set expires_at = now() - interval '1 second' where user_id = $1 and used_at is null", [member.userId]);
      expectStatus(await t.http().post('/api/v1/password-reset').send({ token: second.code, newPassword: NEW_PASSWORD }), 410);
      expectStatus(await t.http().post('/api/v1/password-reset').send({ token: 'x'.repeat(43), newPassword: NEW_PASSWORD }), 410);
    });

    it('sends the link by SMS or email, sealed until it is sent', async () => {
      const sms = await admin(operator).post(`/users/${member.userId}/password-reset`, { channel: 'sms' });
      expectStatus(sms, 201);
      expect(sms.body).toMatchObject({ channel: 'sms', code: null, link: null, sentTo: expect.stringMatching(/\*\*\*/) });
      const queued = await outboxEvents(t, 'notification.sms', member.userId);
      expect(JSON.stringify(queued)).not.toContain('reset-password');
      await t.flushNotifications();
      const texted = t.sms.lastTo(member.phone);
      expect(texted?.template).toBe('password_reset');
      const link = new URL(texted?.tokens.link ?? '');
      expect(`${link.origin}${link.pathname}`).toBe(`${ORIGIN}/reset-password`);

      expectStatus(await admin(operator).post(`/users/${member.userId}/password-reset`, { channel: 'email' }), 400);
      await t.admin.query("update users set email = 'reset.me@example.com' where id = $1", [member.userId]);
      const email = await admin(operator).post(`/users/${member.userId}/password-reset`, { channel: 'email' });
      expectStatus(email, 201);
      expect((email.body as PasswordResetIssued).sentTo).toBe('re***@example.com');
      await t.flushNotifications();
      const mailed = t.mail.find((message) => message.to === 'reset.me@example.com');
      expect(mailed?.subject).toBe('بازنشانی رمز عبور تسک‌دون');
      const code = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(mailed?.text ?? '')?.[1];
      expect(code).toBeTruthy();
      // The emailed code superseded the texted one.
      expectStatus(await t.http().post('/api/v1/password-reset').send({ token: link.searchParams.get('token'), newPassword: NEW_PASSWORD }), 410);
      expectStatus(await t.http().post('/api/v1/password-reset').send({ token: code, newPassword: 'Sevomin-Ramz-99' }), 204);
      expect(await audits('admin.password_reset.issue', `and target_user_id = '${member.userId}'`)).toHaveLength(5);
    });
  });
});

