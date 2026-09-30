/**
 * Sign-in with phone and password, and recovery with an SMS code, against a running TaskDoon API.
 *
 *   API_LOG=/path/to/api.log node e2e/live/password.mjs      # BASE_URL defaults to http://localhost:3000
 *
 * Same requirements as the live flow (console SMS driver logging to `API_LOG`, the live web build
 * proxying `/api/v1`). Covers: an account with a workspace and a password (set up through the
 * API, as the first-workspace step does) → the sign-in card offers «ورود با رمز عبور» beside the
 * SMS code, which stays the default → a wrong password is refused with one message → the right
 * one signs in → «فراموشی رمز عبور»: a reset code texted to the phone and a new password sign
 * this device in → the other device's session is gone, the old password no longer works.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const apiLog = process.env.API_LOG;
if (!apiLog) {
  console.error('Set API_LOG to the file the API logs to: the console SMS driver writes codes there.');
  process.exit(2);
}

const OTP = /"text":"کد ورود شما به تسک‌دون: (\d{6})"/g;
const RESET = /"text":"کد بازنشانی رمز عبور تسک‌دون: (\d{6})"/g;
const runId = String(Date.now()).slice(-4);
const phone = `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const fullName = `نرگس رمزدار ${runId}`;
const workspaceName = `فضای رمز ${runId}`;
const FIRST_PASSWORD = `Avalin-Ramz-${runId}!`;
const NEW_PASSWORD = `Ramz-Tazeh-${runId}!`;

const logSize = () => statSync(apiLog).size;

async function smsAfter(from, pattern, what) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const text = readFileSync(apiLog).subarray(from).toString('utf8');
    const match = [...text.matchAll(pattern)].at(-1);
    if (match?.[1]) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No ${what} in ${apiLog} within 20 s.`);
}

async function api(method, path, { token, body, idempotent } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers['idempotency-key'] = randomUUID();
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/* ---------- Setup through the API: an account, its password and its workspace ---------- */

const from = logSize();
const codeSentAt = Date.now();
const challenge = await api('POST', '/auth/otp/request', { body: { phone } });
const code = await smsAfter(from, OTP, 'sign-in code');
const verified = await api('POST', '/auth/otp/verify', { body: { challengeId: challenge.body.challengeId, code } });
const signedUp = await api('POST', '/auth/signup', { body: { signupToken: verified.body.signupToken, fullName } });
check(signedUp.status === 201, 'the account is created by SMS code');
check((await api('POST', '/auth/password', { token: signedUp.body.accessToken, body: { newPassword: FIRST_PASSWORD } })).status === 204, '…and sets a password');
check((await api('POST', '/workspaces', { token: signedUp.body.accessToken, body: { name: workspaceName }, idempotent: true })).status === 201, '…and a workspace');

/* ---------- Phone and password ---------- */

const browser = await launch();
const viewport = { width: 1440, height: 900 };
const first = await (await browser.newContext({ viewport, locale: 'fa-IR' })).newPage();
// This device is refused on purpose twice (a wrong password; its session after the reset), and
// the browser logs each 401 it receives. Every other message still fails the suite.
watchConsole(first, { allow: [/the server responded with a status of 401/] });
await first.goto(`${base}/feed`);
check(await visible(first.getByRole('heading', { name: 'ورود به تسک‌دون' }), 30_000), 'the sign-in card opens on the SMS code, as before');
check(await visible(first.getByRole('button', { name: 'دریافت کد ورود' })), '…«دریافت کد ورود» stays the main action');
await first.getByRole('button', { name: 'ورود با رمز عبور' }).click();
check(await visible(first.getByRole('heading', { name: 'ورود با رمز عبور' })), '«ورود با رمز عبور» offers phone and password');
await first.getByRole('textbox', { name: 'شماره موبایل' }).fill(phone);
await first.getByLabel('رمز عبور', { exact: true }).fill('Not-The-Password-1');
await first.getByRole('button', { name: 'ورود', exact: true }).click();
check(await visible(first.getByText('شماره موبایل یا رمز عبور درست نیست.')), 'a wrong password is refused, without saying which part was wrong');
await first.getByLabel('رمز عبور', { exact: true }).fill(FIRST_PASSWORD);
await first.screenshot({ path: `${out}/password_signin.png` });
await first.getByRole('button', { name: 'ورود', exact: true }).click();
check(await visible(first.getByRole('navigation', { name: 'ناوبری اصلی' }), 30_000), 'the right one signs in, into the workspace');

/* ---------- «فراموشی رمز عبور» on another device ---------- */

const second = await (await browser.newContext({ viewport, locale: 'fa-IR' })).newPage();
watchConsole(second);
await second.goto(`${base}/feed`);
await second.getByRole('button', { name: 'ورود با رمز عبور' }).click();
await second.getByRole('button', { name: 'فراموشی رمز عبور' }).click();
check(await visible(second.getByRole('heading', { name: 'فراموشی رمز عبور' })), '«فراموشی رمز عبور» asks for the phone number');
await second.getByRole('textbox', { name: 'شماره موبایل' }).fill(phone);
// A number can ask for a new code once a minute.
await new Promise((resolve) => setTimeout(resolve, Math.max(0, codeSentAt + 62_000 - Date.now())));
const resetFrom = logSize();
await second.getByRole('button', { name: 'ارسال کد بازنشانی' }).click();
check(await visible(second.getByRole('heading', { name: 'گذاشتن رمز عبور تازه' }), 15_000), '…and texts a reset code');
await second.getByRole('textbox', { name: 'کد بازنشانی' }).fill(await smsAfter(resetFrom, RESET, 'reset code'));
await second.getByLabel('رمز عبور تازه', { exact: true }).fill(NEW_PASSWORD);
await second.getByLabel('تکرار رمز عبور تازه', { exact: true }).fill('Something-Else-1');
await second.getByRole('button', { name: 'ذخیره رمز و ورود' }).click();
check(await visible(second.getByText('تکرار رمز عبور با خود آن یکی نیست.')), 'a repeat that differs is caught before anything is sent');
await second.getByLabel('تکرار رمز عبور تازه', { exact: true }).fill(NEW_PASSWORD);
await second.screenshot({ path: `${out}/password_reset.png` });
await second.getByRole('button', { name: 'ذخیره رمز و ورود' }).click();
check(await visible(second.getByRole('navigation', { name: 'ناوبری اصلی' }), 30_000), 'the new password is saved and signs this device in');

await first.reload();
check(await visible(first.getByRole('heading', { name: 'ورود به تسک‌دون' }), 30_000), 'the other device was signed out');
check(
  await eventually(async () => (await api('POST', '/auth/password/login', { body: { phone, password: FIRST_PASSWORD } })).body?.code === 'CREDENTIALS_INVALID'),
  'the old password no longer works',
);
check((await api('POST', '/auth/password/login', { body: { phone, password: NEW_PASSWORD } })).status === 200, '…the new one does');

await finish(browser);
