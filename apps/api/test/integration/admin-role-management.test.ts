import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdministrativeUser } from '@taskin/contracts';
import { bearer, createTestApp, lastCode, randomIp, randomPhone, requestOtp, signIn, STRONG_PASSWORD, withAdminPassword, refreshCookies, type Session, type TestApp } from './harness.js';
import { PRIMARY_OWNER_PHONE } from '../../src/platform/security/platform-role-policy.js';

const base = '/api/v1/admin/users/roles';
const hash = (s: string) => createHash('sha256').update(s).digest();
describe('SUPER_ADMIN administrative role management', () => {
  let t: TestApp; let owner: Session; let admin: Session; let regular: Session;
  beforeAll(async () => {
    t = await createTestApp();
    owner = await withAdminPassword(t, await signIn(t, PRIMARY_OWNER_PHONE));
    admin = await withAdminPassword(t, await signIn(t)); regular = await signIn(t);
    await t.admin.query("update users set is_platform_admin = true, platform_admin_role = case when phone = $1 then 'SUPER_ADMIN' else 'ADMIN' end where id = any($2::uuid[])", [PRIMARY_OWNER_PHONE, [owner.userId, admin.userId]]);
  });
  afterAll(async () => { await t?.close(); });
  const request = () => t.http().set('X-Forwarded-For', randomIp());
  const assign = (phone = randomPhone(), role: 'ADMIN' | 'OPERATOR' = 'ADMIN') => request().post(base).set(bearer(owner)).send({ phone, fullName: 'مدیر تازه', recoveryEmail: `${phone.slice(-9)}@example.test`, role });
  const proof = async (phone: string) => {
    const otp = await requestOtp(t, phone);
    const response = await request().post('/api/v1/auth/otp/verify').send({ challengeId: otp.challengeId, code: lastCode(t, phone) });
    expect(response.status).toBe(200); return response;
  };
  const setupEmail = (token: string) => request().post('/api/v1/auth/admin/setup/request').send({ temporaryToken: token });
  const setup = (token: string, code: string) => request().post('/api/v1/auth/admin/setup/complete').send({ temporaryToken: token, code, newPassword: STRONG_PASSWORD });
  const mailCode = () => t.mail.at(-1)?.text.match(/[A-Za-z0-9_-]{43}/)?.[0] ?? '';

  it('requires authenticated SUPER_ADMIN plus OTP and fresh password step-up on every endpoint', async () => {
    expect((await request().get(base)).status).toBe(401);
    expect((await request().get(base).set(bearer(regular))).status).toBe(404);
    for (const role of ['ADMIN', 'OPERATOR']) {
      await t.admin.query('update users set platform_admin_role = $1 where id = $2', [role, admin.userId]);
      expect((await request().get(base).set(bearer(admin))).status).toBe(403);
      expect((await request().post(base).set(bearer(admin)).send({})).status).toBe(403);
      expect((await request().patch(`${base}/${owner.userId}`).set(bearer(admin)).send({ suspended: true })).status).toBe(403);
      expect((await request().delete(`${base}/${owner.userId}`).set(bearer(admin))).status).toBe(403);
    }
    expect((await request().get(base).set(bearer(owner))).status).toBe(200);
    const unstepped = await signIn(t, PRIMARY_OWNER_PHONE);
    expect((await request().get(base).set(bearer(unstepped))).body.code).toBe('STEP_UP_REQUIRED');
  });
  it('lists all administrative fields and keeps the owner protected', async () => {
    const result = await request().get(base).set(bearer(owner));
    const row = (result.body as AdministrativeUser[]).find(u => u.id === owner.userId);
    expect(row).toMatchObject({ role: 'SUPER_ADMIN', protected: true, phone: PRIMARY_OWNER_PHONE, status: 'ACTIVE', createdAt: expect.any(String) });
    expect((await request().patch(`${base}/${owner.userId}`).set(bearer(owner)).send({ role: 'OPERATOR', suspended: true })).status).toBe(409);
    expect((await request().delete(`${base}/${owner.userId}`).set(bearer(owner))).status).toBe(409);
    expect((await assign(PRIMARY_OWNER_PHONE)).status).toBe(409);
  });
  it('protects the owner through legacy session, moderation, reset and database paths', async () => {
    for (const path of [`/admin/sessions/${owner.sessionId}/revoke`, `/admin/users/${owner.userId}/sessions/revoke-all`, `/admin/users/${owner.userId}/password-reset`]) {
      const response = await request().post(`/api/v1${path}`).set(bearer(admin)).send({ channel: 'manual' });
      // Session endpoints reject extra body fields, so exercise them again without payload.
      if (path.endsWith('/password-reset')) expect(response.status).toBe(409);
      else expect((await request().post(`/api/v1${path}`).set(bearer(admin)).send({})).status).toBe(409);
    }
    expect((await request().post(`/api/v1/admin/users/${owner.userId}/suspend`).set(bearer(admin)).send({ reason: 'نباید مجاز باشد' })).status).toBe(409);
    expect((await request().put(`/api/v1/admin/users/${owner.userId}/password-reset-required`).set(bearer(admin)).send({ required: true })).status).toBe(409);
    await expect(t.appPool.query('update users set is_platform_admin = false where id = $1', [owner.userId])).rejects.toMatchObject({ code: '42501' });
    await expect(t.appPool.query('delete from users where id = $1', [owner.userId])).rejects.toMatchObject({ code: '42501' });
    // An administrative reset link issued before deployment must not bypass owner protection.
    const oldReset = 'k'.repeat(43);
    await t.admin.query("insert into password_reset_tokens(user_id,token_hash,channel,created_by,expires_at) values($1,$2,'manual',$3,now()+interval '1 hour')", [owner.userId, hash(oldReset), admin.userId]);
    const reset = await request().post('/api/v1/password-reset').send({ token: oldReset, newPassword: 'Cannot-Take-Owner-1405!' });
    expect(reset.body.code).toBe('RESET_TOKEN_INVALID');
    expect((await request().get('/api/v1/me').set(bearer(owner))).status).toBe(200);
  });
  it('pre-provisions an unverified PENDING_SETUP account and refuses forged privilege fields', async () => {
    const phone = randomPhone(); const result = await assign(phone, 'OPERATOR');
    expect(result.status).toBe(201); expect(result.body).toMatchObject({ role: 'OPERATOR', status: 'PENDING_SETUP' });
    const rows = await t.admin.query('select phone_verified_at, email_verified_at, password_hash from users where id = $1', [result.body.id]);
    expect(rows.rows[0]).toEqual({ phone_verified_at: null, email_verified_at: null, password_hash: null });
    expect((await assign(phone)).status).toBe(409);
    expect((await request().patch(`${base}/${result.body.id}`).set(bearer(owner)).send({ role: null })).status).toBe(400);
    expect((await request().patch(`${base}/${result.body.id}`).set(bearer(owner)).send({ suspended: null })).status).toBe(400);
    expect((await request().post(base).set(bearer(owner)).send({ phone: randomPhone(), fullName: 'مدیر جعلی', recoveryEmail: 'fake@example.test', role: 'SUPER_ADMIN' })).status).toBe(400);
    expect((await request().post(base).set(bearer(owner)).send({ phone: randomPhone(), fullName: 'مدیر جعلی', recoveryEmail: 'fake@example.test', role: 'ADMIN', isPlatformAdmin: true })).status).toBe(400);
  });
  it('elevates an existing user, preserves their identity, and immediately invalidates old sessions', async () => {
    const before = await withAdminPassword(t, await signIn(t));
    const assigned = await assign(before.phone); expect(assigned.status).toBe(201); expect(assigned.body.id).toBe(before.userId);
    expect((await request().get('/api/v1/me').set(bearer(before))).status).toBe(401);
    const otp = await proof(before.phone); expect(otp.body.status).toBe('admin_setup_required'); expect(otp.headers['set-cookie']).toBeUndefined();
    expect((await request().post('/api/v1/auth/admin/password').send({ temporaryToken: otp.body.temporaryToken, password: STRONG_PASSWORD })).status).toBe(401);
    expect((await request().post('/api/v1/auth/password/login').send({ phone: before.phone, password: STRONG_PASSWORD })).status).toBe(401);
  });
  it('requires both destinations and a strong password, activates once, then uses the Phase 1 login', async () => {
    const phone = randomPhone(); const assigned = await assign(phone); const verified = await proof(phone); const token = verified.body.temporaryToken as string;
    expect(verified.body.status).toBe('admin_setup_required');
    expect((await request().get('/api/v1/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await setupEmail(token)).status).toBe(204); const code = mailCode(); expect(code).toHaveLength(43);
    expect((await setup(token, 'z'.repeat(43))).status).toBe(401);
    expect((await request().post('/api/v1/auth/admin/setup/complete').send({ temporaryToken: token, code, newPassword: 'abcdefgh' })).status).toBe(400);
    const completed = await Promise.all([setup(token, code), setup(token, code)]);
    expect(completed.map(r => r.status).sort()).toEqual([204, 401]); expect(completed.every(r => !r.headers['set-cookie'])).toBe(true);
    const rows = await t.admin.query('select platform_admin_status, phone_verified_at, email_verified_at from users where id=$1', [assigned.body.id]);
    expect(rows.rows[0]).toMatchObject({ platform_admin_status: 'ACTIVE', phone_verified_at: expect.any(Date), email_verified_at: expect.any(Date) });
    const next = await proof(phone); expect(next.body.status).toBe('password_required');
    const signedIn = await request().post('/api/v1/auth/admin/password').send({ temporaryToken: next.body.temporaryToken, password: STRONG_PASSWORD }); expect(signedIn.status).toBe(200);
    const needsStepUp = await request().get(base).set('Authorization', `Bearer ${signedIn.body.accessToken}`);
    expect(needsStepUp.body.code).toBe('STEP_UP_REQUIRED');
    const elevated = await request().post('/api/v1/auth/step-up').set('Authorization', `Bearer ${signedIn.body.accessToken}`).send({ password: STRONG_PASSWORD });
    expect(elevated.status).toBe(200);
    expect((await request().get(base).set('Authorization', `Bearer ${elevated.body.accessToken}`)).status).toBe(403);
    expect((await request().patch(`${base}/${assigned.body.id}`).set(bearer(owner)).send({ role: 'OPERATOR' })).status).toBe(200);
    expect((await request().get('/api/v1/me').set('Authorization', `Bearer ${elevated.body.accessToken}`)).status).toBe(401);
    const replacement = await signIn(t, phone);
    expect((await request().delete(`${base}/${assigned.body.id}`).set(bearer(owner))).status).toBe(204);
    expect((await request().get('/api/v1/me').set(bearer(replacement))).status).toBe(401);
    expect((await signIn(t, phone)).userId).toBe(assigned.body.id);
  });
  it('expires setup proofs and keeps setup required across suspend/resume', async () => {
    const phone = randomPhone(); const assigned = await assign(phone); const first = await proof(phone); const token = first.body.temporaryToken as string;
    expect((await request().patch(`${base}/${assigned.body.id}`).set(bearer(owner)).send({ suspended: true })).status).toBe(200);
    expect((await setupEmail(token)).status).toBe(401);
    const resumed = await request().patch(`${base}/${assigned.body.id}`).set(bearer(owner)).send({ suspended: false }); expect(resumed.body.status).toBe('PENDING_SETUP');
    const second = await proof(phone); const current = second.body.temporaryToken as string;
    await t.admin.query("update auth_challenges set expires_at=now()-interval '1 second' where token_hash=$1", [hash(current)]);
    expect((await setupEmail(current)).status).toBe(401);
  });
  it('suspends an active admin immediately, resumes only the established role, and revokes back to a regular account', async () => {
    const phone = randomPhone(); const assigned = await assign(phone);
    const first = await proof(phone); const token = first.body.temporaryToken as string;
    expect((await setupEmail(token)).status).toBe(204);
    expect((await setup(token, mailCode())).status).toBe(204);
    const active = await signIn(t, phone);
    expect((await request().patch(`${base}/${assigned.body.id}`).set(bearer(owner)).send({ suspended: true })).body.status).toBe('SUSPENDED');
    expect((await request().get('/api/v1/me').set(bearer(active))).status).toBe(401);
    const otp = await requestOtp(t, phone);
    const denied = await request().post('/api/v1/auth/otp/verify').send({ challengeId: otp.challengeId, code: lastCode(t, phone) });
    expect(denied.body.code).toBe('ACCOUNT_SUSPENDED');
    expect(denied.headers['set-cookie']).toBeUndefined();
    expect((await request().patch(`${base}/${assigned.body.id}`).set(bearer(owner)).send({ suspended: false })).body.status).toBe('ACTIVE');
    const resumed = await signIn(t, phone);
    expect((await request().get('/api/v1/me').set(bearer(resumed))).status).toBe(200);
    expect((await request().delete(`${base}/${assigned.body.id}`).set(bearer(owner))).status).toBe(204);
    expect((await request().get('/api/v1/me').set(bearer(resumed))).status).toBe(401);
    const normal = await request().post('/api/v1/auth/password/login').send({ phone, password: STRONG_PASSWORD });
    expect(normal.status).toBe(200);
    expect((await request().get('/api/v1/admin/me').set('Authorization', `Bearer ${normal.body.accessToken}`)).status).toBe(404);
  });
  it('binds setup email codes to their original OTP and rejects client-controlled delivery addresses', async () => {
    const phone = randomPhone(); await assign(phone);
    const a = await proof(phone); const aToken = a.body.temporaryToken as string;
    expect((await request().post('/api/v1/auth/admin/setup/request').send({ temporaryToken: aToken, email: 'attacker@example.test' })).status).toBe(400);
    expect((await setupEmail(aToken)).status).toBe(204); const code = mailCode();
    const b = await proof(phone);
    expect((await setup(b.body.temporaryToken as string, code)).status).toBe(401);
    expect((await setup(aToken, code)).status).toBe(204);
  });
  it('does not leave an authenticated refresh session when OTP login races administrative elevation', async () => {
    const regular = await signIn(t); const otp = await requestOtp(t, regular.phone);
    const [login, elevation] = await Promise.all([
      request().post('/api/v1/auth/otp/verify').send({ challengeId: otp.challengeId, code: lastCode(t, regular.phone) }),
      assign(regular.phone),
    ]);
    expect(elevation.status).toBe(201); expect(login.status).toBe(200);
    if (login.body.status === 'signed_in') {
      expect((await request().get('/api/v1/me').set('Authorization', `Bearer ${login.body.session.accessToken}`)).status).toBe(401);
      const stale = { ...regular }; refreshCookies(stale, login.headers['set-cookie']);
      const refreshed = await request().post('/api/v1/auth/refresh').set('Cookie', stale.cookies).set('X-CSRF-Token', stale.csrf).set('Origin', 'https://app.taskin.test').send({});
      expect(refreshed.status).toBe(401);
    } else {
      expect(login.body.status).toBe('admin_setup_required'); expect(login.headers['set-cookie']).toBeUndefined();
    }
  });
  it('serializes duplicate assignment and records every role mutation in both audit trails', async () => {
    const phone = randomPhone(); const results = await Promise.all([assign(phone), assign(phone)]); expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    const id = results.find(r => r.status === 201)?.body.id as string;
    expect((await request().patch(`${base}/${id}`).set(bearer(owner)).send({ role: 'OPERATOR' })).body.role).toBe('OPERATOR');
    expect((await request().delete(`${base}/${id}`).set(bearer(owner))).status).toBe(204);
    const row = (await t.admin.query('select is_platform_admin,platform_admin_role from users where id=$1', [id])).rows[0];
    expect(row).toEqual({ is_platform_admin: false, platform_admin_role: null });
    const actions = (await t.admin.query('select action from platform_audit_logs where target_user_id=$1', [id])).rows.map(r => r.action);
    expect(actions).toEqual(expect.arrayContaining(['admin.roles.assign', 'admin.roles.update', 'admin.roles.revoke']));
    const returned = await signIn(t, phone); expect((await request().get('/api/v1/me').set(bearer(returned))).status).toBe(200);
  });
});
