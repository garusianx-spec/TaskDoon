import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthSession, OtpChallenge, OtpVerifyResult, PlatformAuditPage, PlatformModerationResult, PlatformUserDetail, PlatformUserPage } from '@taskin/contracts';
import {
  bearer,
  createTestApp,
  lastCode,
  localForm,
  randomIp,
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
import { connect, type Connected } from './socket-helpers.js';
import { expectStatus, outboxEvents } from './work-helpers.js';

const ORIGIN = 'https://app.taskin.test';
const ADMIN_IP = '192.0.2.44';
const NEW_PASSWORD = 'Tazeh-Ramz-1405!';

interface AuditRow {
  admin_id: string;
  target_user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip: string | null;
  request_id: string | null;
  trace_id: string | null;
  metadata: Record<string, unknown> | null;
}

describe('Platform super admin (phase 2): moderation and session control', () => {
  let t: TestApp;
  /** A platform admin, stepped up. */
  let operator: Session;
  /** The same account signed in without a step-up. */
  let operatorFresh: Session;
  /** A second platform admin. */
  let peer: Session;
  /** Someone with a password, but no platform role. */
  let outsider: Session;
  const open: Connected[] = [];

  /** Sends an admin request with its own request id, trace and address, and returns them. */
  const admin = (as: Session) => {
    const ids = () => ({ requestId: `req-${randomBytes(6).toString('hex')}`, traceId: randomBytes(16).toString('hex') });
    const send = (method: 'get' | 'post' | 'put', path: string, body?: Record<string, unknown>) => {
      const { requestId, traceId } = ids();
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
  const audits = async (action: string, targetUserId: string): Promise<AuditRow[]> =>
    (
      await t.admin.query<AuditRow>(
        'select admin_id, target_user_id, action, resource_type, resource_id, host(ip) as ip, request_id, trace_id, metadata from platform_audit_logs where action = $1 and target_user_id = $2 order by id',
        [action, targetUserId],
      )
    ).rows;
  const accountOf = async (userId: string) =>
    (
      await t.admin.query<{ status: string; security_version: number; password_reset_required: boolean }>(
        'select status, security_version, password_reset_required from users where id = $1',
        [userId],
      )
    ).rows[0];
  const sessionsOf = async (userId: string) =>
    (await t.admin.query<{ id: string; revoked_at: Date | null; revoke_reason: string | null }>('select id, revoked_at, revoke_reason from auth_sessions where user_id = $1', [userId])).rows;

  const refresh = (session: Session) => t.http().post('/api/v1/auth/refresh').set('Cookie', session.cookies).set('X-CSRF-Token', session.csrf).set('Origin', ORIGIN);
  const me = (session: Session) => t.http().get('/api/v1/me').set(bearer(session));
  const passwordLogin = (phone: string, password = STRONG_PASSWORD) =>
    t.http().set('X-Forwarded-For', randomIp()).post('/api/v1/auth/password/login').send({ phone: localForm(phone), password });
  /** Asks for a sign-in code and presents it, returning the raw answer. */
  const otpVerify = async (phone: string) => {
    const challenge = await requestOtp(t, phone);
    return t.http().set('X-Forwarded-For', randomIp()).post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code: lastCode(t, phone) });
  };
  /** Someone with a password and a second device, both signed in. */
  const member = async (name: string): Promise<{ first: Session; second: Session }> => {
    const first = await withAdminPassword(t, await signIn(t, randomPhone(), name));
    const second = await signIn(t, first.phone);
    return { first, second };
  };
  const result = (response: { body: unknown }) => response.body as PlatformModerationResult;

  beforeAll(async () => {
    t = await createTestApp();
    operatorFresh = await signIn(t, randomPhone(), 'ناظر پلتفرم');
    operator = await withAdminPassword(t, operatorFresh);
    await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
    peer = await withAdminPassword(t, await signIn(t, randomPhone(), 'ناظر دوم'));
    await t.admin.query('update users set is_platform_admin = true where id = $1', [peer.userId]);
    outsider = await withAdminPassword(t, await signIn(t, randomPhone(), 'کاربر عادی'));
  });
  afterAll(async () => {
    for (const connected of open) connected.socket.close();
    await t?.close();
  });

  describe('access', () => {
    const actions = (userId: string) => [
      (as: Session) => admin(as).post(`/users/${userId}/suspend`, { reason: 'بررسی دسترسی' }),
      (as: Session) => admin(as).post(`/users/${userId}/unsuspend`),
      (as: Session) => admin(as).put(`/users/${userId}/password-reset-required`, { required: true }),
    ];

    it('does not exist for anyone else, and asks a platform admin for a fresh step-up', async () => {
      const target = await signIn(t, randomPhone(), 'هدف دسترسی');
      for (const act of actions(target.userId)) {
        const hidden = await act(outsider);
        expectStatus(hidden, 404);
        expect(hidden.body).toMatchObject({ code: 'NOT_FOUND' });
        const fresh = await act(operatorFresh);
        expectStatus(fresh, 401);
        expect(fresh.body).toMatchObject({ code: 'STEP_UP_REQUIRED' });
      }
      expectStatus(await t.http().post(`/api/v1/admin/users/${target.userId}/suspend`).send({ reason: 'بدون ورود' }), 401);
      expect(await accountOf(target.userId)).toMatchObject({ status: 'active', password_reset_required: false });
      expect((await t.admin.query("select count(*)::int as n from platform_audit_logs where action like 'admin.user.%' and target_user_id = $1", [target.userId])).rows[0]).toEqual({ n: 0 });
    });

    it('holds a password session until it is confirmed with an SMS code', async () => {
      const login = await passwordLogin(operator.phone);
      expectStatus(login, 200);
      const passwordOnly = await stepUp(t, { ...operator, accessToken: (login.body as AuthSession).accessToken, sessionId: (login.body as AuthSession).sessionId });
      const target = await signIn(t, randomPhone(), 'هدف پیامکی');
      for (const act of actions(target.userId)) {
        const refused = await act(passwordOnly);
        expectStatus(refused, 401);
        expect(refused.body).toMatchObject({ code: 'SMS_CONFIRMATION_REQUIRED' });
      }
      expect((await accountOf(target.userId))?.status).toBe('active');
    });

    it('wants a reason for a suspension, and a yes or no for a password reset', async () => {
      const target = await signIn(t, randomPhone(), 'هدف اعتبارسنجی');
      for (const body of [{}, { reason: '' }, { reason: '    ' }, { reason: ' ab ' }, { reason: 'x'.repeat(501) }, { reason: 42 }]) {
        const response = await admin(operator).post(`/users/${target.userId}/suspend`, body);
        expectStatus(response, 400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      }
      for (const body of [{}, { required: 'yes' }, { required: true, signOut: 'no' }, { required: true, reason: 'x'.repeat(501) }]) {
        expectStatus(await admin(operator).put(`/users/${target.userId}/password-reset-required`, body), 400);
      }
      expectStatus(await admin(operator).post(`/users/${target.userId}/unsuspend`, { reason: 'x'.repeat(501) }), 400);
      expectStatus(await admin(operator).post('/users/not-a-uuid/suspend', { reason: 'شناسه نادرست' }), 400);
      expect((await accountOf(target.userId))?.status).toBe('active');
    });

    it('refuses one’s own account, another platform admin, and an account that is not there', async () => {
      for (const act of actions(operator.userId)) {
        const self = await act(operator);
        expectStatus(self, 403);
        expect(self.body).toMatchObject({ code: 'ADMIN_SELF_ACTION' });
      }
      const protectedAdmin = await admin(operator).post(`/users/${peer.userId}/suspend`, { reason: 'تلاش برای قفل کردن مدیر' });
      expectStatus(protectedAdmin, 409);
      expect(protectedAdmin.body).toMatchObject({ code: 'ADMIN_TARGET_PROTECTED' });
      expect(await accountOf(peer.userId)).toMatchObject({ status: 'active' });
      expectStatus(await me(peer), 200);

      for (const act of actions(randomUUID())) expectStatus(await act(operator), 404);
      const gone = await signIn(t, randomPhone(), 'حساب حذف‌شده');
      await t.admin.query("update users set status = 'deleted', deleted_at = now() where id = $1", [gone.userId]);
      for (const act of actions(gone.userId)) expectStatus(await act(operator), 404);
      // A refused action is not recorded: it did not happen.
      for (const userId of [operator.userId, peer.userId, gone.userId]) {
        expect((await t.admin.query("select count(*)::int as n from platform_audit_logs where action like 'admin.user.%' and target_user_id = $1", [userId])).rows[0]).toEqual({ n: 0 });
      }
    });
  });

  describe('«تعلیق کاربر»', () => {
    let target: { first: Session; second: Session };
    /** The suspension request's ids and its answer. */
    let suspension: { requestId: string; traceId: string; body: PlatformModerationResult };
    let socket: Connected;
    let versionBefore: number;

    beforeAll(async () => {
      target = await member('کاربر متخلف');
      socket = await connect(t.baseUrl, target.first.accessToken);
      open.push(socket);
      versionBefore = (await accountOf(target.first.userId))?.security_version ?? -1;
      const request = admin(operator).post(`/users/${target.first.userId}/suspend`, { reason: '  ارسال پیام‌های تبلیغاتی انبوه  ' });
      const response = await request;
      expectStatus(response, 200);
      suspension = { requestId: request.requestId, traceId: request.traceId, body: result(response) };
    });

    it('suspends the account and ends every session in the same step', async () => {
      const { body } = suspension;
      expect(body).toMatchObject({ changed: true, user: { id: target.first.userId, status: 'suspended', activeSessionCount: 0 } });
      expect(body.sessionsRevoked).toBeGreaterThanOrEqual(2);
      expect(await accountOf(target.first.userId)).toMatchObject({ status: 'suspended', security_version: versionBefore + 1 });
      const sessions = await sessionsOf(target.first.userId);
      expect(sessions.length).toBe(body.sessionsRevoked);
      expect(sessions.every((session) => session.revoked_at !== null && session.revoke_reason === 'admin_action')).toBe(true);
      expect((await outboxEvents(t, 'session.revoked', target.first.userId)).map((event) => event.payload)).toContainEqual(
        expect.objectContaining({ userId: target.first.userId, reason: 'admin_action', sessionIds: expect.arrayContaining([target.first.sessionId, target.second.sessionId]) }),
      );
    });

    it('stops the person at once: access tokens, refresh, sockets and every way back in', async () => {
      for (const session of [target.first, target.second]) {
        const denied = await me(session);
        expectStatus(denied, 401);
        expect(denied.body).toMatchObject({ code: 'SESSION_REVOKED' });
      }
      // Refreshing says why, and clears the cookies.
      const refused = await refresh(target.first);
      expectStatus(refused, 403);
      expect(refused.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
      expect(String(refused.headers['set-cookie'])).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
      // So does a new sign-in code.
      const verify = await otpVerify(target.first.phone);
      expectStatus(verify, 403);
      expect(verify.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
      // A password sign-in still gives nothing away about the account.
      const login = await passwordLogin(target.first.phone);
      expectStatus(login, 401);
      expect(login.body).toMatchObject({ code: 'CREDENTIALS_INVALID' });
      expectStatus(await t.http().post('/api/v1/auth/step-up').set(bearer(target.first)).send({ password: STRONG_PASSWORD }), 401);

      await t.flushNotifications();
      await socket.closed;
      expect(socket.events.map((envelope) => envelope.type)).toContain('session:revoked');
      await expect(connect(t.baseUrl, target.first.accessToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    });

    it('records who, whom, why, from where, and the request and trace ids', async () => {
      const rows = await audits('admin.user.suspend', target.first.userId);
      expect(rows).toEqual([
        {
          admin_id: operator.userId,
          target_user_id: target.first.userId,
          action: 'admin.user.suspend',
          resource_type: 'user',
          resource_id: target.first.userId,
          ip: ADMIN_IP,
          request_id: suspension.requestId,
          trace_id: suspension.traceId,
          metadata: { reason: 'ارسال پیام‌های تبلیغاتی انبوه', previousStatus: 'active', sessionsRevoked: suspension.body.sessionsRevoked, changed: true },
        },
      ]);
      // The ordinary audit trail has its twin, in the same transaction.
      const twin = await t.admin.query('select actor_user_id, request_id, trace_id from audit_logs where action = $1 and resource_id = $2', ['platform.admin.user.suspend', target.first.userId]);
      expect(twin.rows).toEqual([{ actor_user_id: operator.userId, request_id: suspension.requestId, trace_id: suspension.traceId }]);

      const page = (await admin(operator).get(`/audit?targetUserId=${target.first.userId}&action=admin.user.suspend`)).body as PlatformAuditPage;
      expect(page.items).toEqual([
        expect.objectContaining({ adminId: operator.userId, adminName: 'ناظر پلتفرم', targetName: 'کاربر متخلف', ip: ADMIN_IP, requestId: suspension.requestId, traceId: suspension.traceId }),
      ]);
    });

    it('shows the suspension in the directory: status, when, why and by whom', async () => {
      const detail = (await admin(operator).get(`/users/${target.first.userId}`)).body as PlatformUserDetail;
      expect(detail.status).toBe('suspended');
      expect(detail.suspension).toMatchObject({ reason: 'ارسال پیام‌های تبلیغاتی انبوه', adminId: operator.userId, adminName: 'ناظر پلتفرم' });
      expect(Date.now() - Date.parse(detail.suspension?.at ?? '')).toBeLessThan(5 * 60_000);
      const suspended = (await admin(operator).get(`/users?status=suspended&q=${target.first.phone.slice(-7)}`)).body as PlatformUserPage;
      expect(suspended.items.map((user) => user.id)).toEqual([target.first.userId]);
      const active = (await admin(operator).get(`/users?status=active&q=${target.first.phone.slice(-7)}`)).body as PlatformUserPage;
      expect(active.items).toEqual([]);
      // Someone who was never suspended has no suspension to show.
      expect(((await admin(operator).get(`/users/${outsider.userId}`)).body as PlatformUserDetail).suspension).toBeNull();
    });

    it('changes nothing when asked again, but still records the attempt', async () => {
      const again = await admin(operator).post(`/users/${target.first.userId}/suspend`, { reason: 'تکرار تعلیق' });
      expectStatus(again, 200);
      expect(result(again)).toMatchObject({ changed: false, sessionsRevoked: 0, user: { status: 'suspended' } });
      expect((await accountOf(target.first.userId))?.security_version).toBe(versionBefore + 1);
      const rows = await audits('admin.user.suspend', target.first.userId);
      expect(rows.map((row) => row.metadata)).toEqual([expect.objectContaining({ changed: true }), { reason: 'تکرار تعلیق', previousStatus: 'suspended', sessionsRevoked: 0, changed: false }]);
      // The suspension shown is still the one that took effect.
      expect(((await admin(operator).get(`/users/${target.first.userId}`)).body as PlatformUserDetail).suspension?.reason).toBe('ارسال پیام‌های تبلیغاتی انبوه');
    });

    it('lifts the suspension: the person signs in again, but ended sessions stay ended', async () => {
      const lifted = admin(operator).post(`/users/${target.first.userId}/unsuspend`, { reason: 'پس از پیگیری پشتیبانی' });
      const liftedResponse = await lifted;
      expectStatus(liftedResponse, 200);
      expect(result(liftedResponse)).toMatchObject({ changed: true, sessionsRevoked: 0, user: { status: 'active' } });
      expect((await accountOf(target.first.userId))?.status).toBe('active');
      expectStatus(await me(target.first), 401);

      const back = await signIn(t, target.first.phone);
      expectStatus(await me(back), 200);
      expectStatus(await passwordLogin(target.first.phone), 200);
      const detail = (await admin(operator).get(`/users/${target.first.userId}`)).body as PlatformUserDetail;
      expect(detail).toMatchObject({ status: 'active', suspension: null });

      expect(await audits('admin.user.unsuspend', target.first.userId)).toEqual([
        expect.objectContaining({
          admin_id: operator.userId,
          ip: ADMIN_IP,
          request_id: lifted.requestId,
          trace_id: lifted.traceId,
          metadata: { reason: 'پس از پیگیری پشتیبانی', previousStatus: 'suspended', changed: true },
        }),
      ]);
      // Lifting it again changes nothing; a reason is optional.
      const again = await admin(operator).post(`/users/${target.first.userId}/unsuspend`);
      expectStatus(again, 200);
      expect(result(again).changed).toBe(false);
      expect((await audits('admin.user.unsuspend', target.first.userId)).at(-1)?.metadata).toEqual({ reason: null, previousStatus: 'active', changed: false });
    });
  });

  describe('«اجبار به تغییر رمز عبور»', () => {
    it('retires the password and signs every session out', async () => {
      const target = await member('رمز لو رفته');
      const versionBefore = (await accountOf(target.first.userId))?.security_version;
      const forced = admin(operator).put(`/users/${target.first.userId}/password-reset-required`, { required: true, reason: 'نشت احتمالی رمز' });
      const forcedResponse = await forced;
      expectStatus(forcedResponse, 200);
      const body = result(forcedResponse);
      expect(body).toMatchObject({ changed: true, user: { id: target.first.userId, status: 'active', passwordResetRequired: true, activeSessionCount: 0 } });
      expect(body.sessionsRevoked).toBeGreaterThanOrEqual(2);
      expect(await accountOf(target.first.userId)).toMatchObject({ status: 'active', password_reset_required: true, security_version: versionBefore });
      for (const session of [target.first, target.second]) expectStatus(await me(session), 401);
      expect((await sessionsOf(target.first.userId)).every((session) => session.revoke_reason === 'admin_action')).toBe(true);

      // The old password opens nothing; the person is told to set a new one.
      const login = await passwordLogin(target.first.phone);
      expectStatus(login, 409);
      expect(login.body).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });
      expect((await passwordLogin(target.first.phone, 'Not-The-Password-9')).body).toMatchObject({ code: 'CREDENTIALS_INVALID' });
      // An SMS sign-in still works, but cannot step up with the retired password.
      const back = await signIn(t, target.first.phone);
      expectStatus(await me(back), 200);
      const stepUpRefused = await t.http().post('/api/v1/auth/step-up').set(bearer(back)).send({ password: STRONG_PASSWORD });
      expectStatus(stepUpRefused, 409);
      expect(stepUpRefused.body).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });

      expect(await audits('admin.user.password_reset_required', target.first.userId)).toEqual([
        {
          admin_id: operator.userId,
          target_user_id: target.first.userId,
          action: 'admin.user.password_reset_required',
          resource_type: 'user',
          resource_id: target.first.userId,
          ip: ADMIN_IP,
          request_id: forced.requestId,
          trace_id: forced.traceId,
          metadata: { required: true, signOut: true, sessionsRevoked: body.sessionsRevoked, reason: 'نشت احتمالی رمز', changed: true },
        },
      ]);
      const twin = await t.admin.query('select request_id, trace_id from audit_logs where action = $1 and resource_id = $2', ['platform.admin.user.password_reset_required', target.first.userId]);
      expect(twin.rows).toEqual([{ request_id: forced.requestId, trace_id: forced.traceId }]);
    });

    it('can leave sessions signed in, and can lift the requirement', async () => {
      const target = await member('رمز تکراری');
      const kept = await admin(operator).put(`/users/${target.first.userId}/password-reset-required`, { required: true, signOut: false });
      expectStatus(kept, 200);
      expect(result(kept)).toMatchObject({ changed: true, sessionsRevoked: 0, user: { passwordResetRequired: true } });
      expectStatus(await me(target.first), 200);
      expectStatus(await me(target.second), 200);
      expect((await passwordLogin(target.first.phone)).body).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });

      const lifted = await admin(operator).put(`/users/${target.first.userId}/password-reset-required`, { required: false, reason: 'اشتباه در شناسایی' });
      expectStatus(lifted, 200);
      expect(result(lifted)).toMatchObject({ changed: true, sessionsRevoked: 0, user: { passwordResetRequired: false } });
      expectStatus(await passwordLogin(target.first.phone), 200);
      // Lifting never signs anyone out, whatever `signOut` says.
      const again = await admin(operator).put(`/users/${target.first.userId}/password-reset-required`, { required: false, signOut: true });
      expect(result(again)).toMatchObject({ changed: false, sessionsRevoked: 0 });
      expectStatus(await me(target.first), 200);
      expect((await audits('admin.user.password_reset_required', target.first.userId)).map((row) => row.metadata)).toEqual([
        { required: true, signOut: false, sessionsRevoked: 0, reason: null, changed: true },
        { required: false, signOut: false, sessionsRevoked: 0, reason: 'اشتباه در شناسایی', changed: true },
        { required: false, signOut: false, sessionsRevoked: 0, reason: null, changed: false },
      ]);
    });

    it('is settled by the person recovering the password with an SMS code', async () => {
      const target = await member('بازیابی پیامکی');
      expectStatus(await admin(operator).put(`/users/${target.first.userId}/password-reset-required`, { required: true }), 200);
      await t.redis.del(`${t.env.REDIS_PREFIX}:otp:send:phone:${target.first.phone}:cooldown`, `${t.env.REDIS_PREFIX}:otp:send:phone:${target.first.phone}:hour`);
      const asked = await t.http().set('X-Forwarded-For', randomIp()).post('/api/v1/auth/password/forgot').send({ phone: localForm(target.first.phone) });
      expectStatus(asked, 200);
      const recovered = await t
        .http()
        .post('/api/v1/auth/password/recover')
        .send({ challengeId: (asked.body as OtpChallenge).challengeId, code: lastCode(t, target.first.phone), newPassword: NEW_PASSWORD });
      expectStatus(recovered, 204);
      expect((await accountOf(target.first.userId))?.password_reset_required).toBe(false);
      expectStatus(await passwordLogin(target.first.phone, NEW_PASSWORD), 200);
      expect(((await admin(operator).get(`/users/${target.first.userId}`)).body as PlatformUserDetail).passwordResetRequired).toBe(false);
    });
  });

  describe('«مشاهده نشست‌های فعال»', () => {
    it('lists a person’s active sessions and ends one, or all of them', async () => {
      const target = await member('نشست‌های چندگانه');
      const third = await signIn(t, target.first.phone);
      const active = async () =>
        ((await admin(operator).get(`/users/${target.first.userId}/sessions?status=active`)).body as { id: string }[]).map((session) => session.id).sort();
      expect(await active()).toEqual([target.first.sessionId, target.second.sessionId, third.sessionId].sort());

      expectStatus(await admin(operator).post(`/sessions/${third.sessionId}/revoke`), 204);
      expect(await active()).toEqual([target.first.sessionId, target.second.sessionId].sort());
      expectStatus(await me(third), 401);
      expectStatus(await me(target.first), 200);

      const all = await admin(operator).post(`/users/${target.first.userId}/sessions/revoke-all`);
      expectStatus(all, 200);
      expect(await active()).toEqual([]);
      // Ending sessions is not a suspension: the person can sign straight back in.
      const back = await otpVerify(target.first.phone);
      expectStatus(back, 200);
      const signedIn = back.body as OtpVerifyResult;
      expect(signedIn.status).toBe('signed_in');
      const session: Session = { ...target.first, accessToken: signedIn.status === 'signed_in' ? signedIn.session.accessToken : '', cookies: '', csrf: '' };
      refreshCookies(session, back.headers['set-cookie']);
      expectStatus(await refresh(session), 200);
    });
  });
});
