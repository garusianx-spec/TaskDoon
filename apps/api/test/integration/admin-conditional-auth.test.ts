import { createHash } from 'node:crypto';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthSession, OtpVerifyResult } from '@taskin/contracts';
import {
  bearer, createTestApp, lastCode, localForm, randomIp, randomPhone, refreshCookies, requestOtp,
  type Session, signIn, STRONG_PASSWORD, type TestApp, withAdminPassword,
} from './harness.js';
import { expectStatus } from './work-helpers.js';

const NEW_PASSWORD = 'Verified-Email-Recovery-1405!';
const TARGET_PHONE = '+989901819085';
const hash = (token: string) => createHash('sha256').update(token).digest();

describe('Conditional OTP and platform admin password challenge', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(); });
  afterAll(async () => { await t?.close(); });

  const makeAdmin = async (phone = randomPhone()) => {
    const first = await withAdminPassword(t, await signIn(t, phone));
    await t.admin.query('update users set is_platform_admin = true where id = $1', [first.userId]);
    return first;
  };
  const challenge = async (phone: string) => {
    const asked = await requestOtp(t, phone);
    const response = await t.http().set('X-Forwarded-For', randomIp()).post('/api/v1/auth/otp/verify')
      .send({ challengeId: asked.challengeId, code: lastCode(t, phone) });
    expectStatus(response, 200);
    return response;
  };
  const temporaryToken = async (phone: string): Promise<string> => {
    const response = await challenge(phone);
    expect(response.body).toMatchObject({ status: 'password_required', temporaryToken: expect.any(String), expiresInSeconds: expect.any(Number) });
    return (response.body as { temporaryToken: string }).temporaryToken;
  };
  const complete = (token: string, password = STRONG_PASSWORD) => t.http().set('X-Forwarded-For', randomIp())
    .post('/api/v1/auth/admin/password').send({ temporaryToken: token, password });
  const requestRecovery = (token: string, extra: Record<string, unknown> = {}) => t.http().set('X-Forwarded-For', randomIp())
    .post('/api/v1/auth/admin/recovery/request').send({ temporaryToken: token, ...extra });
  const recover = (token: string, code: string, newPassword = NEW_PASSWORD) => t.http()
    .post('/api/v1/auth/admin/recovery/complete').send({ temporaryToken: token, code, newPassword });
  const lastMailCode = () => {
    const message = t.mail.at(-1);
    const code = message?.text.match(/[A-Za-z0-9_-]{43}/)?.[0];
    expect(code, 'a recovery secret must be delivered by mail').toBeTruthy();
    return code ?? '';
  };

  it('does not expose role status on phone submission, including 09901819085', async () => {
    const admin = await makeAdmin(TARGET_PHONE);
    const regular = await signIn(t);
    const { challengeId: adminId, ...adminShape } = await requestOtp(t, admin.phone);
    const { challengeId: regularId, ...regularShape } = await requestOtp(t, regular.phone);
    const { challengeId: unknownId, ...unknownShape } = await requestOtp(t, randomPhone());
    expect(adminShape).toEqual(regularShape);
    expect(adminShape).toEqual(unknownShape);
    expect(Object.keys(adminShape).sort()).toEqual(['codeLength', 'expiresInSeconds', 'resendInSeconds']);
    expect(new Set([adminId, regularId, unknownId]).size).toBe(3);
  });

  it('issues no session or cookie after admin OTP and accepts only the password completion as a sign-in', async () => {
    const admin = await makeAdmin();
    const before = await t.admin.query('select id from auth_sessions where user_id = $1', [admin.userId]);
    const response = await challenge(admin.phone);
    expect(response.body.status).toBe('password_required');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body.session).toBeUndefined();
    expect((await t.admin.query('select id from auth_sessions where user_id = $1', [admin.userId])).rows).toEqual(before.rows);
    const token = (response.body as { temporaryToken: string }).temporaryToken;
    expectStatus(await t.http().get('/api/v1/me').set('Authorization', `Bearer ${token}`), 401);
    expectStatus(await t.http().post('/api/v1/auth/signup').send({ signupToken: token, fullName: 'توکن محدود' }), 400);
    expectStatus(await t.http().post('/api/v1/auth/refresh').send({ temporaryToken: token }), 403);
    expectStatus(await complete(token, 'Wrong-Admin-Password-1'), 401);
    const signedIn = await complete(token);
    expectStatus(signedIn, 200);
    const body = signedIn.body as AuthSession;
    expect(body.user.id).toBe(admin.userId);
    expect(decodeJwt(body.accessToken).amr).toEqual(expect.arrayContaining(['otp', 'pwd']));
    const session: Session = { ...admin, accessToken: body.accessToken, sessionId: body.sessionId, cookies: '', csrf: '' };
    refreshCookies(session, signedIn.headers['set-cookie']);
    expect(session.cookies).toContain('taskin_rt=');
    expectStatus(await t.http().get('/api/v1/me').set(bearer(session)), 200);
    expectStatus(await complete(token), 401);
  });

  it('rejects expired challenges, changed security versions and a newly suspended account', async () => {
    const admin = await makeAdmin();
    const expired = await temporaryToken(admin.phone);
    await t.admin.query("update auth_challenges set expires_at = now() - interval '1 minute' where token_hash = $1", [hash(expired)]);
    expectStatus(await complete(expired), 401);
    const stale = await temporaryToken(admin.phone);
    await t.admin.query('update users set security_version = security_version + 1 where id = $1', [admin.userId]);
    expectStatus(await complete(stale), 401);
    const suspended = await temporaryToken(admin.phone);
    await t.admin.query("update users set status = 'suspended' where id = $1", [admin.userId]);
    expectStatus(await complete(suspended), 401);
  });

  it('allows just one concurrent redemption of an admin password challenge', async () => {
    const admin = await makeAdmin();
    const token = await temporaryToken(admin.phone);
    const responses = await Promise.all([complete(token), complete(token)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
  });

  it('retains account lockout across password challenges', async () => {
    const admin = await makeAdmin();
    const token = await temporaryToken(admin.phone);
    for (let attempt = 1; attempt < 10; attempt += 1) expectStatus(await complete(token, `Wrong-Password-${attempt}`), 401);
    expectStatus(await complete(token, 'Wrong-Password-10'), 423);
    expectStatus(await complete(await temporaryToken(admin.phone)), 423);
  });

  it('blocks password-only login and SMS recovery for admins while keeping ordinary OTP sign-in', async () => {
    const admin = await makeAdmin();
    expectStatus(await t.http().post('/api/v1/auth/password/login').send({ phone: localForm(admin.phone), password: STRONG_PASSWORD }), 401);
    // A reset code issued before elevation is not an escape hatch after elevation.
    const member = await withAdminPassword(t, await signIn(t));
    await t.redis.del(`${t.env.REDIS_PREFIX}:otp:send:phone:${member.phone}:cooldown`);
    const asked = await t.http().set('X-Forwarded-For', randomIp()).post('/api/v1/auth/password/forgot').send({ phone: member.phone });
    expectStatus(asked, 200);
    const smsCode = lastCode(t, member.phone);
    await t.admin.query('update users set is_platform_admin = true where id = $1', [member.userId]);
    expectStatus(await t.http().post('/api/v1/auth/password/recover').send({ challengeId: asked.body.challengeId, code: smsCode, newPassword: NEW_PASSWORD }), 400);
    const regular = await signIn(t);
    const ordinary = (await challenge(regular.phone)).body as OtpVerifyResult;
    expect(ordinary.status).toBe('signed_in');
  });

  it('never sends admin recovery to an unverified address or a caller-supplied destination', async () => {
    const admin = await makeAdmin();
    await t.admin.query('update users set email = $1, email_verified_at = null where id = $2', [`unverified-${admin.userId}@example.test`, admin.userId]);
    const token = await temporaryToken(admin.phone);
    const before = t.mail.length;
    const absent = await requestRecovery(token);
    expectStatus(absent, 204);
    expect(absent.text).toBe('');
    expect(t.mail.length).toBe(before);
    expectStatus(await requestRecovery(token, { email: 'attacker@example.test' }), 400);
    expect(t.mail.length).toBe(before);
  });

  it('recovers only through the verified current email, revokes old sessions and invalidates both secrets', async () => {
    const admin = await makeAdmin();
    const email = `verified-${admin.userId}@example.test`;
    await t.admin.query('update users set email = $1, email_verified_at = now() where id = $2', [email, admin.userId]);
    const token = await temporaryToken(admin.phone);
    const before = (await t.admin.query<{ security_version: number }>('select security_version from users where id = $1', [admin.userId])).rows[0]?.security_version ?? 0;
    expectStatus(await requestRecovery(token), 204);
    expect(t.mail.at(-1)?.to).toBe(email);
    const code = lastMailCode();
    expectStatus(await recover(token, 'x'.repeat(43)), 401);
    expectStatus(await recover(token, code, 'onlyletters'), 400);
    await t.admin.query("update users set password_reset_required = true, locked_until = now() + interval '10 minutes' where id = $1", [admin.userId]);
    expectStatus(await recover(token, code), 204);
    expectStatus(await t.http().get('/api/v1/me').set(bearer(admin)), 401);
    const state = (await t.admin.query('select security_version, password_reset_required, locked_until, failed_password_attempts from users where id = $1', [admin.userId])).rows[0];
    expect(state).toMatchObject({ password_reset_required: false, locked_until: null, failed_password_attempts: 0 });
    expect(Number(state.security_version)).toBeGreaterThan(before);
    expectStatus(await recover(token, code), 401);
    expectStatus(await complete(token, NEW_PASSWORD), 401);
    const next = await temporaryToken(admin.phone);
    expectStatus(await complete(next, STRONG_PASSWORD), 401);
    expectStatus(await complete(next, NEW_PASSWORD), 200);
  });

  it('invalidates recovery when the verified email changes or the emailed code expires', async () => {
    const admin = await makeAdmin();
    await t.admin.query('update users set email = $1, email_verified_at = now() where id = $2', [`first-${admin.userId}@example.test`, admin.userId]);
    const token = await temporaryToken(admin.phone);
    expectStatus(await requestRecovery(token), 204);
    const code = lastMailCode();
    await t.admin.query('update users set email = $1, email_verified_at = now() where id = $2', [`second-${admin.userId}@example.test`, admin.userId]);
    expectStatus(await recover(token, code), 401);
    const nextToken = await temporaryToken(admin.phone);
    expectStatus(await requestRecovery(nextToken), 204);
    const expired = lastMailCode();
    await t.admin.query("update auth_challenges set expires_at = now() - interval '1 minute' where token_hash = $1", [hash(expired)]);
    expectStatus(await recover(nextToken, expired), 401);
  });

  it('binds emailed recovery proofs to the exact OTP challenge and limits recovery mail requests', async () => {
    const admin = await makeAdmin();
    await t.admin.query('update users set email = $1, email_verified_at = now() where id = $2', [`bound-${admin.userId}@example.test`, admin.userId]);
    const first = await temporaryToken(admin.phone);
    const second = await temporaryToken(admin.phone);
    expectStatus(await requestRecovery(first), 204);
    const code = lastMailCode();
    const stored = (await t.admin.query<{ token_hash: Buffer }>("select token_hash from auth_challenges where user_id = $1 and purpose = 'admin_recovery' and consumed_at is null", [admin.userId])).rows[0];
    expect(stored?.token_hash.equals(hash(code))).toBe(true);
    expect(stored?.token_hash.toString()).not.toBe(code);
    expectStatus(await recover(second, code), 401);
    expectStatus(await recover(first, code), 204);

    const other = await makeAdmin();
    const token = await temporaryToken(other.phone);
    for (let request = 0; request < 5; request += 1) expectStatus(await requestRecovery(token), 204);
    expectStatus(await requestRecovery(token), 429);
  });

  it('does not revive an email verification proof after changing an address away and back', async () => {
    const user = await signIn(t);
    const email = `original-${user.userId}@example.test`;
    expectStatus(await t.http().patch('/api/v1/me').set(bearer(user)).send({ email }), 200);
    expectStatus(await t.http().post('/api/v1/auth/email/verification/request').set(bearer(user)).send({}), 204);
    const code = lastMailCode();
    expectStatus(await t.http().patch('/api/v1/me').set(bearer(user)).send({ email: `temporary-${user.userId}@example.test` }), 200);
    expectStatus(await t.http().patch('/api/v1/me').set(bearer(user)).send({ email }), 200);
    expectStatus(await t.http().post('/api/v1/auth/email/verification/confirm').set(bearer(user)).send({ code }), 401);
    expect((await t.admin.query('select email_verified_at from users where id = $1', [user.userId])).rows[0]?.email_verified_at).toBeNull();
  });

  it('verifies email ownership once and clears verification when the profile address changes', async () => {
    const user = await signIn(t);
    const email = `profile-${user.userId}@example.test`;
    expectStatus(await t.http().patch('/api/v1/me').set(bearer(user)).send({ email }), 200);
    expectStatus(await t.http().post('/api/v1/auth/email/verification/request').set(bearer(user)).send({}), 204);
    expect(t.mail.at(-1)?.to).toBe(email);
    const code = lastMailCode();
    expectStatus(await t.http().post('/api/v1/auth/email/verification/confirm').set(bearer(user)).send({ code }), 204);
    expect((await t.admin.query('select email_verified_at from users where id = $1', [user.userId])).rows[0]?.email_verified_at).toBeTruthy();
    expectStatus(await t.http().post('/api/v1/auth/email/verification/confirm').set(bearer(user)).send({ code }), 401);
    expectStatus(await t.http().patch('/api/v1/me').set(bearer(user)).send({ email: `changed-${user.userId}@example.test` }), 200);
    expect((await t.admin.query('select email_verified_at from users where id = $1', [user.userId])).rows[0]?.email_verified_at).toBeNull();
  });
});
