import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthSession, OtpChallenge } from '@taskin/contracts';
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
import { expectStatus, outboxEvents } from './work-helpers.js';

const ORIGIN = 'https://app.taskin.test';
const NEW_PASSWORD = 'Tazeh-Ramz-1405!';

describe('Sign-in with phone and password, recovery with an SMS code', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  /** An account with a password (set right after its SMS sign-in, as the web does). */
  const withPassword = async (name = 'کاربر رمزدار') => withAdminPassword(t, await signIn(t, randomPhone(), name));
  const login = (phone: string, password: string, ip = randomIp()) =>
    t.http().set('X-Forwarded-For', ip).post('/api/v1/auth/password/login').send({ phone: localForm(phone), password });
  /** Past the per-number resend cooldown, like a person waiting a minute. */
  const clearSendLimits = (phone: string) =>
    t.redis.del(`${t.env.REDIS_PREFIX}:otp:send:phone:${phone}:cooldown`, `${t.env.REDIS_PREFIX}:otp:send:phone:${phone}:hour`);
  const forgot = async (phone: string) => {
    await clearSendLimits(phone);
    return t.http().set('X-Forwarded-For', randomIp()).post('/api/v1/auth/password/forgot').send({ phone: localForm(phone) });
  };
  const recover = (challengeId: string, code: string, newPassword: string) =>
    t.http().post('/api/v1/auth/password/recover').send({ challengeId, code, newPassword });
  const amrOf = async (sessionId: string) => (await t.admin.query<{ amr: string[] }>('select amr from auth_sessions where id = $1', [sessionId])).rows[0]?.amr;

  it('signs in with phone and password: a password session with cookies, refresh, and no step-up', async () => {
    const user = await withPassword();
    const response = await login(user.phone, STRONG_PASSWORD);
    expectStatus(response, 200);
    const session = response.body as AuthSession;
    expect(session.user.id).toBe(user.userId);
    expect(await amrOf(session.sessionId)).toEqual(['pwd']);
    // Signing in with the password is not a step-up: that stays a separate, explicit act.
    expect(decodeJwt(session.accessToken).stepup_at).toBeUndefined();
    expectStatus(await t.http().get('/api/v1/me').set(bearer({ ...user, accessToken: session.accessToken })), 200);

    const signedIn: Session = { ...user, accessToken: session.accessToken, sessionId: session.sessionId, cookies: '', csrf: '' };
    refreshCookies(signedIn, response.headers['set-cookie']);
    const refreshed = await t.http().post('/api/v1/auth/refresh').set('Cookie', signedIn.cookies).set('X-CSRF-Token', signedIn.csrf).set('Origin', ORIGIN);
    expectStatus(refreshed, 200);
    expect((refreshed.body as AuthSession).sessionId).toBe(session.sessionId);

    const { rows } = await t.admin.query("select actor_user_id from audit_logs where action = 'auth.signin.password' and resource_id = $1", [session.sessionId]);
    expect(rows).toEqual([{ actor_user_id: user.userId }]);
  });

  it('gives one answer for an unknown number, an account without a password, a wrong password and a suspended account', async () => {
    const user = await withPassword();
    const noPassword = await signIn(t, randomPhone());
    for (const response of [
      await login(randomPhone(), STRONG_PASSWORD),
      await login(noPassword.phone, STRONG_PASSWORD),
      await login(user.phone, 'Not-The-Password-9'),
    ]) {
      expectStatus(response, 401);
      expect(response.body).toMatchObject({ code: 'CREDENTIALS_INVALID' });
    }
    await t.admin.query("update users set status = 'suspended' where id = $1", [user.userId]);
    try {
      const suspended = await login(user.phone, STRONG_PASSWORD);
      expectStatus(suspended, 401);
      expect(suspended.body).toMatchObject({ code: 'CREDENTIALS_INVALID' });
    } finally {
      await t.admin.query("update users set status = 'active', failed_password_attempts = 0 where id = $1", [user.userId]);
    }
    expectStatus(await t.http().post('/api/v1/auth/password/login').send({ phone: '12345', password: 'x' }), 400);
  });

  it('locks the password after ten wrong ones, for sign-in and step-up alike, and texts the owner', async () => {
    const user = await withPassword();
    const ip = randomIp();
    for (let attempt = 1; attempt < 10; attempt += 1) expectStatus(await login(user.phone, `Wrong-Password-${attempt}`, ip), 401);
    const tenth = await login(user.phone, 'Wrong-Password-10', ip);
    expectStatus(tenth, 423);
    expect(tenth.body).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    // Locked: the right password is told so; anyone else still learns nothing.
    expect((await login(user.phone, STRONG_PASSWORD, ip)).body).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect((await login(user.phone, 'Still-Wrong-11', ip)).body).toMatchObject({ code: 'CREDENTIALS_INVALID' });
    expectStatus(await t.http().post('/api/v1/auth/step-up').set(bearer(user)).send({ password: STRONG_PASSWORD }), 423);
    expect((await outboxEvents(t, 'notification.sms', user.userId)).some((event) => event.payload.template === 'alert')).toBe(true);
    const { rows } = await t.admin.query<{ changes: { via?: string } }>("select changes from audit_logs where action = 'auth.password.failed' and actor_user_id = $1", [user.userId]);
    expect(rows.length).toBe(9);
    expect(rows.every((row) => row.changes?.via === 'signin')).toBe(true);
  });

  it('limits password sign-in attempts per address', async () => {
    const ip = randomIp();
    const phone = randomPhone();
    for (let attempt = 0; attempt < 30; attempt += 1) expectStatus(await login(phone, 'Guess-Password-1', ip), 401);
    const limited = await login(phone, 'Guess-Password-1', ip);
    expectStatus(limited, 429);
    expect(limited.headers['retry-after']).toBeTruthy();
    expectStatus(await login(phone, 'Guess-Password-1'), 401);
  });

  it('refuses the old password of an account a platform admin reset', async () => {
    const user = await withPassword();
    await t.admin.query('update users set password_reset_required = true where id = $1', [user.userId]);
    expect((await login(user.phone, STRONG_PASSWORD)).body).toMatchObject({ code: 'PASSWORD_RESET_REQUIRED' });
    expect((await login(user.phone, 'Wrong-Password-1')).body).toMatchObject({ code: 'CREDENTIALS_INVALID' });
  });

  it('replaces a forgotten password with a reset code texted to the phone, and signs every session out', async () => {
    const user = await withPassword('کاربر فراموشکار');
    const otherDevice = await signIn(t, user.phone);
    // An admin-issued reset and a lockout are both settled by recovering with the phone.
    await t.admin.query("update users set password_reset_required = true, locked_until = now() + interval '10 minutes' where id = $1", [user.userId]);

    const asked = await forgot(user.phone);
    expectStatus(asked, 200);
    const challenge = asked.body as OtpChallenge;
    const texted = t.sms.lastTo(user.phone);
    expect(texted?.template).toBe('otp_reset');
    expect(texted?.text).toMatch(/^کد بازنشانی رمز عبور تسک‌دون: \d{6}$/);
    const code = texted?.tokens.code ?? '';
    const { rows } = await t.admin.query('select purpose from otp_challenges where id = $1', [challenge.challengeId]);
    expect(rows).toEqual([{ purpose: 'password_reset' }]);

    // A reset code does not sign in.
    const asLogin = await t.http().post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code });
    expectStatus(asLogin, 400);
    expect(asLogin.body).toMatchObject({ code: 'OTP_INVALID' });
    // A short or weak password is refused before the code is spent.
    expect((await recover(challenge.challengeId, code, 'short')).body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await recover(challenge.challengeId, code, 'onlyletters')).body).toMatchObject({ code: 'PASSWORD_TOO_WEAK' });

    expectStatus(await recover(challenge.challengeId, code, NEW_PASSWORD), 204);
    for (const session of [user, otherDevice]) expectStatus(await t.http().get('/api/v1/me').set(bearer(session)), 401);
    expect((await login(user.phone, STRONG_PASSWORD)).body).toMatchObject({ code: 'CREDENTIALS_INVALID' });
    const fresh = await login(user.phone, NEW_PASSWORD);
    expectStatus(fresh, 200);
    const state = await t.admin.query('select password_reset_required, locked_until, failed_password_attempts from users where id = $1', [user.userId]);
    expect(state.rows[0]).toEqual({ password_reset_required: false, locked_until: null, failed_password_attempts: 0 });
    // Used once.
    expectStatus(await recover(challenge.challengeId, code, 'Yek-Ramz-Digar-2'), 400);
    const audited = await t.admin.query("select changes from audit_logs where action = 'auth.password.recover' and actor_user_id = $1", [user.userId]);
    expect(audited.rows[0]?.changes).toMatchObject({ sessionsSignedOut: expect.any(Number) });
    expect((await outboxEvents(t, 'notification.sms', user.userId)).some((event) => (event.payload.tokens as { event?: string }).event?.includes('کد پیامکی'))).toBe(true);
  });

  it('does not accept a sign-in code for recovery', async () => {
    const user = await withPassword();
    await clearSendLimits(user.phone);
    const loginChallenge = await requestOtp(t, user.phone);
    const response = await recover(loginChallenge.challengeId, lastCode(t, user.phone), NEW_PASSWORD);
    expectStatus(response, 400);
    expect(response.body).toMatchObject({ code: 'OTP_INVALID' });
    expectStatus(await login(user.phone, STRONG_PASSWORD), 200);
  });

  it('answers the same for a number without an account, and texts it nothing', async () => {
    const phone = randomPhone();
    const asked = await forgot(phone);
    expectStatus(asked, 200);
    expect(Object.keys(asked.body as OtpChallenge).sort()).toEqual(['challengeId', 'codeLength', 'expiresInSeconds', 'resendInSeconds']);
    expect(t.sms.lastTo(phone)).toBeUndefined();
    expect((await recover((asked.body as OtpChallenge).challengeId, '123456', NEW_PASSWORD)).body).toMatchObject({ code: 'OTP_INVALID' });
  });

  it('confirms a password session with a code sent to the account’s own phone', async () => {
    const user = await withPassword();
    const signedIn = (await login(user.phone, STRONG_PASSWORD)).body as AuthSession;
    const session: Session = { ...user, accessToken: signedIn.accessToken, sessionId: signedIn.sessionId };
    await clearSendLimits(user.phone);
    const requested = await t.http().post('/api/v1/auth/otp/confirm/request').set(bearer(session));
    expectStatus(requested, 200);
    const challenge = requested.body as OtpChallenge;
    expect(t.sms.lastTo(user.phone)?.template).toBe('otp');
    const code = lastCode(t, user.phone);
    // Only its own code: a wrong one, or a sign-in code, does not confirm.
    expectStatus(await t.http().post('/api/v1/auth/otp/confirm').set(bearer(session)).send({ challengeId: challenge.challengeId, code: code === '000000' ? '111111' : '000000' }), 400);
    const confirmed = await t.http().post('/api/v1/auth/otp/confirm').set(bearer(session)).send({ challengeId: challenge.challengeId, code });
    expectStatus(confirmed, 200);
    expect((await amrOf(signedIn.sessionId))?.sort()).toEqual(['otp', 'pwd']);
    expect(decodeJwt((confirmed.body as AuthSession).accessToken).amr).toEqual(expect.arrayContaining(['otp', 'pwd']));

    const other = await withPassword();
    await clearSendLimits(other.phone);
    const signInChallenge = await requestOtp(t, other.phone);
    expectStatus(
      await t.http().post('/api/v1/auth/otp/confirm').set(bearer(other)).send({ challengeId: signInChallenge.challengeId, code: lastCode(t, other.phone) }),
      400,
    );
    // Step-up still needs the password after the confirmation.
    expect(decodeJwt((confirmed.body as AuthSession).accessToken).stepup_at).toBeUndefined();
    expectStatus(await t.http().get('/api/v1/me').set(bearer(await stepUp(t, { ...session, accessToken: (confirmed.body as AuthSession).accessToken }))), 200);
  });
});
