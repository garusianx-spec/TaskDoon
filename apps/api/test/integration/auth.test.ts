import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  createTestApp,
  lastCode,
  localForm,
  ownerWithWorkspace,
  randomPhone,
  refreshCookies,
  requestOtp,
  type Session,
  signIn,
  STRONG_PASSWORD,
  type TestApp,
  withAdminPassword,
} from './harness.js';

const ORIGIN = 'https://app.taskin.test';

describe('M1 checklist: authentication', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  const refresh = (session: Session, extra: Record<string, string> = {}) =>
    t.http().post('/api/v1/auth/refresh').set('Cookie', session.cookies).set('X-CSRF-Token', session.csrf).set('Origin', ORIGIN).set(extra);

  describe('OTP sign-in', () => {
    it('signs a new number up, then signs it in', async () => {
      const phone = randomPhone();
      const first = await signIn(t, phone, 'مریم احمدی');
      const me = await t.http().get('/api/v1/me').set(bearer(first));
      expect(me.status).toBe(200);
      expect(me.body.user).toMatchObject({ phone, fullName: 'مریم احمدی', hasPassword: false });

      const again = await signIn(t, phone);
      expect(again.userId).toBe(first.userId);
      expect(again.sessionId).not.toBe(first.sessionId);
    });

    it('accepts any written form of the number, Persian digits included', async () => {
      const phone = randomPhone();
      const persian = localForm(phone).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
      const response = await t.http().post('/api/v1/auth/otp/request').send({ phone: persian });
      expect(response.status).toBe(200);
      expect(t.sms.lastTo(phone)?.tokens.code).toMatch(/^[0-9]{6}$/);
    });

    it('answers identically for known and unknown numbers (no enumeration)', async () => {
      const known = await signIn(t);
      await t.redis.del(`${t.env.REDIS_PREFIX}:otp:send:phone:${known.phone}:cooldown`);
      const { challengeId: knownId, ...forKnown } = await requestOtp(t, known.phone);
      const { challengeId: unknownId, ...forUnknown } = await requestOtp(t, randomPhone());
      expect(forKnown).toEqual(forUnknown);
      expect(knownId).not.toBe(unknownId);
    });

    it('rejects numbers that are not Iranian mobiles', async () => {
      for (const phone of ['02188776655', '+4915112345678', '12345']) {
        const response = await t.http().post('/api/v1/auth/otp/request').send({ phone });
        expect({ phone, status: response.status, code: response.body.code }).toEqual({ phone, status: 400, code: 'VALIDATION_FAILED' });
      }
    });

    it('locks a challenge after five wrong codes, even for the right code afterwards', async () => {
      const phone = randomPhone();
      const challenge = await requestOtp(t, phone);
      const code = lastCode(t, phone);
      const wrong = code === '000000' ? '111111' : '000000';
      const codes: string[] = [];
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await t.http().post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code: wrong });
        codes.push(response.body.code);
      }
      expect(codes).toEqual(['OTP_INVALID', 'OTP_INVALID', 'OTP_INVALID', 'OTP_INVALID', 'OTP_ATTEMPTS_EXCEEDED']);
      const right = await t.http().post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code });
      expect(right.status).toBe(429);
      expect(right.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    });

    it('refuses a used code', async () => {
      const phone = randomPhone();
      const challenge = await requestOtp(t, phone);
      const code = lastCode(t, phone);
      expect((await t.http().post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code })).status).toBe(200);
      const replay = await t.http().post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code });
      expect(replay.body.code).toBe('OTP_EXPIRED');
    });

    it('enforces the resend cooldown per number', async () => {
      const phone = randomPhone();
      await requestOtp(t, phone);
      const again = await t.http().post('/api/v1/auth/otp/request').send({ phone: localForm(phone) });
      expect(again.status).toBe(429);
      expect(again.body.code).toBe('RATE_LIMITED');
      expect(Number(again.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('allows five codes per number per hour', async () => {
      const phone = randomPhone();
      const statuses: number[] = [];
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        await t.redis.del(`${t.env.REDIS_PREFIX}:otp:send:phone:${phone}:cooldown`);
        statuses.push((await t.http().post('/api/v1/auth/otp/request').set('X-Forwarded-For', `198.51.100.${attempt}`).send({ phone: localForm(phone) })).status);
      }
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    });

    it('allows twenty codes per IP address per hour', async () => {
      const statuses: number[] = [];
      for (let attempt = 1; attempt <= 21; attempt += 1) {
        statuses.push((await t.http().post('/api/v1/auth/otp/request').set('X-Forwarded-For', '192.0.2.77').send({ phone: localForm(randomPhone()) })).status);
      }
      expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
      expect(statuses[20]).toBe(429);
    });

    it('redeems a sign-up token only once', async () => {
      const phone = randomPhone();
      const challenge = await requestOtp(t, phone);
      const verify = await t.http().post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code: lastCode(t, phone) });
      const { signupToken } = verify.body as { signupToken: string };
      expect((await t.http().post('/api/v1/auth/signup').send({ signupToken, fullName: 'نخستین' })).status).toBe(201);
      const replay = await t.http().post('/api/v1/auth/signup').send({ signupToken, fullName: 'دومین' });
      expect(replay.body.code).toBe('SIGNUP_TOKEN_INVALID');
    });
  });

  describe('access tokens', () => {
    it('needs a token, and a valid one', async () => {
      expect((await t.http().get('/api/v1/me')).body.code).toBe('UNAUTHENTICATED');
      expect((await t.http().get('/api/v1/me').set('Authorization', 'Bearer not.a.jwt')).body.code).toBe('AUTH_INVALID');
    });

    it('dies with the user’s security version', async () => {
      const session = await signIn(t);
      expect((await t.http().get('/api/v1/me').set(bearer(session))).status).toBe(200);
      await t.admin.query('update users set security_version = security_version + 1 where id = $1', [session.userId]);
      await t.redis.del(`${t.env.REDIS_PREFIX}:user:standing:${session.userId}`);
      const after = await t.http().get('/api/v1/me').set(bearer(session));
      expect(after.status).toBe(401);
      expect(after.body.code).toBe('SESSION_REVOKED');
    });
  });

  describe('refresh tokens', () => {
    it('rotates the refresh cookie on every use', async () => {
      const session = await signIn(t);
      const before = session.cookies;
      const response = await refresh(session);
      expect(response.status).toBe(200);
      refreshCookies(session, response.headers['set-cookie']);
      expect(session.cookies).not.toBe(before);
      const me = await t.http().get('/api/v1/me').set('Authorization', `Bearer ${response.body.accessToken}`);
      expect(me.status).toBe(200);
    });

    it('tolerates two tabs refreshing with the same token at once', async () => {
      const session = await signIn(t);
      const [first, second] = await Promise.all([refresh(session), refresh(session)]);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect((await t.http().get('/api/v1/me').set(bearer(session))).status).toBe(200);
    });

    it('revokes the whole session when a rotated-out token comes back later', async () => {
      const session = await signIn(t);
      const stolen = { ...session };
      const rotated = await refresh(session);
      refreshCookies(session, rotated.headers['set-cookie']);
      // Past the concurrent-refresh grace window.
      await t.admin.query(
        `update refresh_tokens set used_at = now() - interval '1 minute' where session_id = $1 and used_at is not null`,
        [session.sessionId],
      );
      const reuse = await refresh(stolen);
      expect(reuse.status).toBe(401);
      expect(reuse.body.code).toBe('SESSION_REVOKED');
      // The legitimate holder's newer token is dead too, and so is every access token.
      expect((await refresh(session)).body.code).toBe('SESSION_REVOKED');
      expect((await t.http().get('/api/v1/me').set(bearer(session))).body.code).toBe('SESSION_REVOKED');
      const { rows } = await t.admin.query(`select revoke_reason from auth_sessions where id = $1`, [session.sessionId]);
      expect(rows[0]?.revoke_reason).toBe('reuse_detected');
      const alert = await t.admin.query(`select payload from outbox_events where event_type = 'notification.sms' and aggregate_id = $1`, [session.userId]);
      expect(alert.rows.some((row) => row.payload.template === 'alert')).toBe(true);
    });

    it('needs the CSRF header and our origin', async () => {
      const session = await signIn(t);
      const noHeader = await t.http().post('/api/v1/auth/refresh').set('Cookie', session.cookies).set('Origin', ORIGIN);
      expect(noHeader.body.code).toBe('CSRF_FAILED');
      const wrongHeader = await t.http().post('/api/v1/auth/refresh').set('Cookie', session.cookies).set('X-CSRF-Token', 'forged').set('Origin', ORIGIN);
      expect(wrongHeader.body.code).toBe('CSRF_FAILED');
      const foreign = await refresh(session, { Origin: 'https://evil.example' });
      expect(foreign.body.code).toBe('CSRF_FAILED');
      expect((await refresh(session)).status).toBe(200);
    });

    it('sets the refresh cookie HttpOnly, Secure, SameSite=Strict and scoped to /api/v1/auth', async () => {
      const response = await refresh(await signIn(t));
      const cookie = (response.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith('__Secure-taskin_rt='));
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    });
  });

  describe('sessions', () => {
    it('lists devices and signs another one out at once', async () => {
      const phone = randomPhone();
      const laptop = await signIn(t, phone);
      const phoneSession = await signIn(t, phone);
      const list = await t.http().get('/api/v1/auth/sessions').set(bearer(laptop));
      expect(list.body).toHaveLength(2);
      expect(list.body.find((s: { current: boolean }) => s.current).id).toBe(laptop.sessionId);

      expect((await t.http().delete(`/api/v1/auth/sessions/${laptop.sessionId}`).set(bearer(laptop))).status).toBe(409);
      expect((await t.http().delete(`/api/v1/auth/sessions/${phoneSession.sessionId}`).set(bearer(laptop))).status).toBe(204);
      expect((await t.http().get('/api/v1/me').set(bearer(phoneSession))).body.code).toBe('SESSION_REVOKED');
      expect((await t.http().get('/api/v1/me').set(bearer(laptop))).status).toBe(200);
    });

    it('signs every other device out', async () => {
      const phone = randomPhone();
      const keep = await signIn(t, phone);
      const others = [await signIn(t, phone), await signIn(t, phone)];
      expect((await t.http().delete('/api/v1/auth/sessions?others=true').set(bearer(keep))).status).toBe(204);
      for (const other of others) expect((await t.http().get('/api/v1/me').set(bearer(other))).status).toBe(401);
      expect((await t.http().get('/api/v1/me').set(bearer(keep))).status).toBe(200);
    });

    it('logs out: the access token and the refresh cookie both die', async () => {
      const session = await signIn(t);
      const out = await t.http().post('/api/v1/auth/logout').set(bearer(session)).set('Cookie', session.cookies).set('X-CSRF-Token', session.csrf).set('Origin', ORIGIN);
      expect(out.status).toBe(204);
      expect((await t.http().get('/api/v1/me').set(bearer(session))).body.code).toBe('SESSION_REVOKED');
      expect((await refresh(session)).body.code).toBe('SESSION_REVOKED');
    });
  });

  describe('admin password and step-up', () => {
    it('requires a step-up for sensitive routes', async () => {
      const { owner, workspace } = await ownerWithWorkspace(t);
      const plain = await signIn(t, owner.phone);
      const response = await t.http().delete(`/api/v1/workspaces/${workspace.id}`).set(bearer(plain)).send({ confirmName: workspace.name });
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('STEP_UP_REQUIRED');
    });

    it('refuses weak passwords', async () => {
      const session = await signIn(t);
      for (const newPassword of ['short1', 'onlyletters', '12345678901']) {
        const response = await t.http().post('/api/v1/auth/password').set(bearer(session)).send({ newPassword });
        expect(response.body.code).toMatch(/PASSWORD_TOO_WEAK|VALIDATION_FAILED/);
      }
    });

    it('changing the password needs the current one and signs out other sessions', async () => {
      const phone = randomPhone();
      const session = await withAdminPassword(t, await signIn(t, phone));
      const other = await signIn(t, phone);
      const fresh = await signIn(t, phone);
      const without = await t.http().post('/api/v1/auth/password').set(bearer(fresh)).send({ newPassword: 'Another-Pass-9' });
      expect(without.body.code).toBe('STEP_UP_REQUIRED');
      const wrong = await t.http().post('/api/v1/auth/password').set(bearer(fresh)).send({ currentPassword: 'nope-nope-1', newPassword: 'Another-Pass-9' });
      expect(wrong.body.code).toBe('PASSWORD_INVALID');
      const ok = await t.http().post('/api/v1/auth/password').set(bearer(fresh)).send({ currentPassword: STRONG_PASSWORD, newPassword: 'Another-Pass-9' });
      expect(ok.status).toBe(204);
      expect((await t.http().get('/api/v1/me').set(bearer(other))).status).toBe(401);
      expect((await t.http().get('/api/v1/me').set(bearer(session))).status).toBe(401);
      expect((await t.http().get('/api/v1/me').set(bearer(fresh))).status).toBe(200);
    });

    it('locks step-up after ten wrong passwords and texts the owner of the number', async () => {
      const session = await withAdminPassword(t, await signIn(t));
      const codes: string[] = [];
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        codes.push((await t.http().post('/api/v1/auth/step-up').set(bearer(session)).send({ password: 'wrong-password-1' })).body.code);
      }
      expect(codes.slice(0, 9).every((code) => code === 'PASSWORD_INVALID')).toBe(true);
      expect(codes[9]).toBe('ACCOUNT_LOCKED');
      const right = await t.http().post('/api/v1/auth/step-up').set(bearer(session)).send({ password: STRONG_PASSWORD });
      expect(right.status).toBe(423);
      const alert = await t.admin.query(`select payload from outbox_events where event_type = 'notification.sms' and aggregate_id = $1`, [session.userId]);
      expect(alert.rows.map((row) => row.payload.template)).toContain('alert');
      const failures = await t.admin.query<{ action: string; count: string }>(
        `select action, count(*) from audit_logs where actor_user_id = $1 and action in ('auth.password.failed', 'auth.password.locked') group by action order by action`,
        [session.userId],
      );
      expect(failures.rows.map((row) => [row.action, Number(row.count)])).toEqual([
        ['auth.password.failed', 9],
        ['auth.password.locked', 1],
      ]);
    });
  });
});
