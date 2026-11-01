/**
 * Conditional admin sign-in and verified email recovery against the live stack.
 * API_LOG, DATABASE_MIGRATOR_URL, and Mailpit (MAILPIT_URL, default :8025) are required.
 * The target phone is a disposable local fixture: refuses an existing account, grants its
 * role only through the operator CLI, and soft-deletes only the account created by this run.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { check, eventually, finish, launch, visible, watchConsole } from '../lib/harness.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const apiLog = process.env.API_LOG;
const phone = process.env.TEST_ADMIN_PHONE ?? '09901819085';
if (!apiLog || !process.env.DATABASE_MIGRATOR_URL) throw new Error('API_LOG and DATABASE_MIGRATOR_URL are required for this isolated fixture.');
if (!/^09\d{9}$/.test(phone)) throw new Error('TEST_ADMIN_PHONE must be a local Iranian mobile number.');
const normalizedPhone = `+98${phone.slice(1)}`;
const runId = randomUUID().slice(0, 8);
const email = `admin-recovery-${runId}@example.test`;
const fullName = `مدیر ورود ${runId}`;
const password = `Admin-Conditional-${runId}!`;
const nextPassword = `Admin-Recovered-${runId}!`;
const grantCommand = process.env.GRANT_PLATFORM_ADMIN ?? `node ${fileURLToPath(new URL('../../../api/dist/cli/platform-admin.js', import.meta.url))} grant`;
const OTP = /"text":"کد ورود شما به تسک‌دون: (\d{6})"/g;
const db = new pg.Client({ connectionString: process.env.DATABASE_MIGRATOR_URL });
await db.connect();
let fixtureId;
let browser;
let lastOtpAt = 0;

async function api(method, path, { token, body, idempotent } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotent) headers['idempotency-key'] = randomUUID();
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}
async function smsAfter(from) {
  let result;
  if (!(await eventually(() => {
    const recipient = `${normalizedPhone.slice(0, 6)}***${normalizedPhone.slice(-4)}`;
    const lines = readFileSync(apiLog).subarray(from).toString('utf8').split('\n').filter((line) => line.includes(`\"to\":\"${recipient}\"`)).join('\n');
    result = [...lines.matchAll(OTP)].at(-1)?.[1];
    return result;
  }, 20_000))) throw new Error('The console SMS driver did not deliver the test OTP.');
  return result;
}
async function emails() {
  const response = await fetch(`${mailpit}/api/v1/messages?limit=100`);
  if (!response.ok) throw new Error(`Mailpit listing failed (${response.status}).`);
  return (await response.json()).messages ?? [];
}
async function emailCodeAfter(known, prefix) {
  let result;
  if (!(await eventually(async () => {
    for (const mail of await emails()) {
      if (known.has(mail.ID) || !mail.To?.some((to) => to.Address === email)) continue;
      const response = await fetch(`${mailpit}/api/v1/message/${mail.ID}`);
      if (!response.ok) continue;
      const text = (await response.json()).Text;
      const code = text?.split(prefix)[1]?.trim().match(/^[A-Za-z0-9_-]{43}/)?.[0];
      if (code) { result = code; return true; }
    }
    return false;
  }, 20_000))) throw new Error('The verified-email message was not delivered to the fixture mailbox.');
  return result;
}
async function otpAt(page) {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, lastOtpAt + 62_000 - Date.now())));
  await page.goto(`${base}/feed`);
  await page.getByRole('textbox', { name: 'شماره موبایل' }).fill(phone);
  const requested = page.waitForResponse((res) => res.url().endsWith('/auth/otp/request') && res.request().method() === 'POST');
  const from = statSync(apiLog).size;
  lastOtpAt = Date.now();
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  const response = await requested;
  const body = await response.json();
  check(response.status() === 200 && Object.keys(body).sort().join(',') === 'challengeId,codeLength,expiresInSeconds,resendInSeconds', 'initial phone submission exposes only the ordinary OTP challenge');
  check((await page.getByLabel('رمز مدیر', { exact: true }).count()) === 0, 'phone submission does not reveal the admin password challenge');
  await page.getByRole('textbox', { name: 'کد ورود' }).fill(await smsAfter(from));
  const verified = page.waitForResponse((res) => res.url().endsWith('/auth/otp/verify') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  const verification = await verified;
  const result = await verification.json();
  check(result.status === 'password_required' && typeof result.temporaryToken === 'string' && !result.session, 'verified admin OTP returns only a temporary challenge token');
  check(!verification.headers()['set-cookie'], 'OTP verification issues no authenticated cookie');
  check(await visible(page.getByRole('heading', { name: 'تأیید رمز مدیر' }), 15_000), 'the admin password challenge appears after the verified OTP');
  check((await page.getByRole('navigation', { name: 'ناوبری اصلی' }).count()) === 0, 'the workspace stays hidden before the second factor');
  return result.temporaryToken;
}

try {
  const existing = await db.query('select id from users where phone=$1 and deleted_at is null', [normalizedPhone]);
  if (existing.rowCount) throw new Error('The admin fixture phone already belongs to an account; refusing to change it. Choose an unused TEST_ADMIN_PHONE for another run.');
  const from = statSync(apiLog).size;
  lastOtpAt = Date.now();
  const challenge = await api('POST', '/auth/otp/request', { body: { phone } });
  const verified = await api('POST', '/auth/otp/verify', { body: { challengeId: challenge.body.challengeId, code: await smsAfter(from) } });
  if (verified.body?.status !== 'signup_required') throw new Error('The fixture must be a new account.');
  const signup = await api('POST', '/auth/signup', { body: { signupToken: verified.body.signupToken, fullName } });
  if (signup.status !== 201) throw new Error('Could not create the isolated account.');
  const session = signup.body;
  fixtureId = session.user.id;
  check((await api('POST', '/auth/password', { token: session.accessToken, body: { newPassword: password } })).status === 204, 'the fixture sets its password before operator elevation');
  check((await api('PATCH', '/me', { token: session.accessToken, body: { email } })).status === 200, 'the fixture stores its recovery email');
  let known = new Set((await emails()).map((mail) => mail.ID));
  check((await api('POST', '/auth/email/verification/request', { token: session.accessToken, body: {} })).status === 204, 'email verification sends a message to the saved address');
  const verificationCode = await emailCodeAfter(known, 'کد تأیید ایمیل تسک‌دون: ');
  check((await api('POST', '/auth/email/verification/confirm', { token: session.accessToken, body: { code: verificationCode } })).status === 204, 'only the delivered email code verifies the recovery address');
  check((await api('POST', '/workspaces', { token: session.accessToken, body: { name: `ورود مدیر ${runId}` }, idempotent: true })).status === 201, 'the account has an isolated workspace');
  execSync(`${grantCommand} ${phone}`, { stdio: 'inherit' });
  check((await api('POST', '/auth/password/login', { body: { phone, password } })).status === 401, 'the correct password alone cannot sign in an admin');

  browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const page = await context.newPage();
  watchConsole(page, { allow: [/the server responded with a status of 401/] });
  const temporaryToken = await otpAt(page);
  check((await api('GET', '/me', { token: temporaryToken })).status === 401, 'the temporary challenge token cannot read an authenticated profile');
  await page.getByLabel('رمز مدیر', { exact: true }).fill('Incorrect-Password-1!');
  const rejected = page.waitForResponse((res) => res.url().endsWith('/auth/admin/password'));
  await page.getByRole('button', { name: 'تکمیل ورود', exact: true }).click();
  check((await rejected).status() === 401, 'an incorrect admin password is rejected');
  check(await visible(page.getByRole('heading', { name: 'تأیید رمز مدیر' })), 'a rejected password keeps the challenge visible');
  await page.getByLabel('رمز مدیر', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'تکمیل ورود', exact: true }).click();
  check(await visible(page.getByRole('navigation', { name: 'ناوبری اصلی' }), 30_000), 'the correct second factor opens the workspace');
  check((await api('POST', '/auth/admin/password', { body: { temporaryToken, password } })).status === 401, 'the successful password challenge cannot be replayed');

  const recoveryContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const recovery = await recoveryContext.newPage();
  watchConsole(recovery);
  const recoveryTemporaryToken = await otpAt(recovery);
  known = new Set((await emails()).map((mail) => mail.ID));
  await recovery.getByRole('button', { name: 'بازیابی با ایمیل تأییدشده' }).click();
  check(await visible(recovery.getByRole('heading', { name: 'بازیابی رمز مدیر' }), 15_000), 'the challenge offers recovery with the verified email');
  check(!(await recovery.locator('body').innerText()).includes(email), 'the recovery form does not expose the saved email');
  const recoveryCode = await emailCodeAfter(known, 'کد بازیابی رمز عبور تسک‌دون: ');
  await recovery.getByLabel('کد بازیابی ایمیل').fill(recoveryCode);
  await recovery.getByLabel('رمز عبور تازه', { exact: true }).fill(nextPassword);
  await recovery.getByLabel('تکرار رمز عبور تازه', { exact: true }).fill(nextPassword);
  await recovery.getByRole('button', { name: 'ذخیره رمز تازه' }).click();
  check(await visible(recovery.getByRole('heading', { name: 'ورود به تسک‌دون' }), 15_000), 'email recovery returns to the phone step for a fresh two-factor sign-in');
  check((await api('POST', '/auth/admin/recovery/complete', { body: { temporaryToken: recoveryTemporaryToken, code: recoveryCode, newPassword: nextPassword } })).status === 401, 'the email recovery code and temporary token cannot be replayed');
  check((await api('GET', '/me', { token: session.accessToken })).status === 401, 'verified email recovery revokes the previous account sessions');
  await page.reload();
  check(await visible(page.getByRole('heading', { name: 'ورود به تسک‌دون' }), 30_000), 'the browser signed in before recovery is also signed out');
  const freshToken = await otpAt(recovery);
  await recovery.getByLabel('رمز مدیر', { exact: true }).fill(nextPassword);
  await recovery.getByRole('button', { name: 'تکمیل ورود', exact: true }).click();
  check(await visible(recovery.getByRole('navigation', { name: 'ناوبری اصلی' }), 30_000), 'a fresh OTP and the recovered password sign the admin in');
  check((await api('GET', '/me', { token: freshToken })).status === 401, 'the recovered challenge remains restricted even after completion');
} finally {
  if (fixtureId) {
    await db.query('update users set is_platform_admin=false, deleted_at=now(), email=null where id=$1 and phone=$2 and full_name=$3', [fixtureId, normalizedPhone, fullName]);
    await db.query("update auth_sessions set revoked_at=now(), revoke_reason='logout' where user_id=$1 and revoked_at is null", [fixtureId]);
  }
  await db.end();
  if (browser) await finish(browser);
}
