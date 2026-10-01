/**
 * The platform super admin, phase 2: moderating an account, against a running TaskDoon API.
 *
 *   API_LOG=/path/to/api.log node e2e/live/moderation.mjs      # BASE_URL defaults to http://localhost:3000
 *
 * Same requirements as the phase 1 admin suite (console SMS driver logging to `API_LOG`, the live
 * web build proxying `/api/v1` and `/rt`, `GRANT_PLATFORM_ADMIN` to flag the operator).
 *
 * Covers: a member with a workspace and a password, signed in on two devices (one of them a
 * browser) → the operator finds her in the directory, whose ⋯ menu offers «مشاهده نشست‌های فعال»
 * (both sessions, in a side panel), «تعلیق کاربر» and «اجبار به تغییر رمز عبور» → a suspension
 * needs a reason, then shows «معلق / مسدود»; her open browser is signed out at once with the
 * suspended message, her token is refused, an SMS code and her password let her nowhere → the
 * audit log has the action, its reason and its trace id → «رفع تعلیق» lets her back in →
 * «اجبار به تغییر رمز عبور» signs her out and retires the password until it is lifted. The
 * operator's own row offers no moderation of herself.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const apiLog = process.env.API_LOG;
if (!apiLog) {
  console.error('Set API_LOG to the file the API logs to: the console SMS driver writes sign-in codes there.');
  process.exit(2);
}
const grantCommand =
  process.env.GRANT_PLATFORM_ADMIN ?? `node ${fileURLToPath(new URL('../../../api/dist/cli/platform-admin.js', import.meta.url))} grant`;

const OTP = /"text":"کد ورود شما به تسک‌دون: (\d{6})"/g;
const runId = String(Date.now()).slice(-4);
const phoneOf = () => `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const targetPhone = phoneOf();
let operatorPhone = phoneOf();
while (operatorPhone === targetPhone) operatorPhone = phoneOf();
const targetName = `سمیرا ناظر ${runId}`;
const operatorName = `ناظر پلتفرم ${runId}`;
const workspaceName = `فضای نظارت ${runId}`;
const TARGET_PASSWORD = `Ramz-Hesab-${runId}!`;
const OPERATOR_PASSWORD = `Modir-Nazer-${runId}!`;
const REASON = 'ارسال پیام‌های تبلیغاتی انبوه';
const SUSPENDED = 'حساب کاربری شما توسط مدیریت تسک‌دون معلق شده است';

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

/** One REST call through the web app's proxy, as the browser would make it. */
async function api(method, path, { token, body, idempotent } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers['idempotency-key'] = randomUUID();
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** When each number was last sent a code: it may ask for another one a minute later. */
const codeSentAt = new Map();
const cooledDown = (phone) => new Promise((resolve) => setTimeout(resolve, Math.max(0, (codeSentAt.get(phone) ?? 0) + 62_000 - Date.now())));

/** A new account by SMS code, without a browser. */
async function signUp(phone, fullName) {
  const from = logSize();
  codeSentAt.set(phone, Date.now());
  const challenge = await api('POST', '/auth/otp/request', { body: { phone } });
  if (challenge.status !== 200) throw new Error(`otp/request ${challenge.status}`);
  const code = await smsAfter(from, OTP, 'sign-in code');
  const verify = await api('POST', '/auth/otp/verify', { body: { challengeId: challenge.body.challengeId, code } });
  if (verify.body?.status !== 'signup_required') throw new Error(`otp/verify ${verify.status}`);
  const signup = await api('POST', '/auth/signup', { body: { signupToken: verify.body.signupToken, fullName } });
  if (signup.status !== 201) throw new Error(`signup ${signup.status}`);
  return signup.body;
}

/** Phone → code on a sign-in card (no sign-up step). */
async function enterCode(page, phone) {
  const phoneBox = page.getByRole('textbox', { name: 'شماره موبایل' });
  await phoneBox.waitFor({ timeout: 30_000 });
  await phoneBox.fill(phone);
  codeSentAt.set(phone, Date.now());
  const from = logSize();
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  const code = await smsAfter(from, OTP, 'sign-in code');
  await page.getByRole('textbox', { name: 'کد ورود' }).fill(code);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
}

/** «ورود با رمز عبور» on the workspace app's sign-in card. */
async function passwordSignIn(page) {
  await page.getByRole('button', { name: 'ورود با رمز عبور' }).click();
  await page.getByRole('textbox', { name: 'شماره موبایل' }).fill(targetPhone);
  await page.getByLabel('رمز عبور', { exact: true }).fill(TARGET_PASSWORD);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
}

/* ---------- Setup through the API: the member, her workspace, a second device ---------- */

const target = await signUp(targetPhone, targetName);
check((await api('POST', '/auth/password', { token: target.accessToken, body: { newPassword: TARGET_PASSWORD } })).status === 204, 'the member sets a password');
check((await api('POST', '/workspaces', { token: target.accessToken, body: { name: workspaceName }, idempotent: true })).status === 201, '…and creates her workspace');
const otherDevice = await api('POST', '/auth/password/login', { body: { phone: targetPhone, password: TARGET_PASSWORD } });
check(otherDevice.status === 200, '…and signs in on a second device');

const browser = await launch();
const viewport = { width: 1440, height: 900 };

// Her browser: signed in with the password, the workspace app open (and its socket connected).
const targetContext = await browser.newContext({ viewport, locale: 'fa-IR' });
const targetPage = await targetContext.newPage();
// Being refused is the point here: the browser logs those answers as console errors.
watchConsole(targetPage, { allow: [/the server responded with a status of 40[139]/] });
await targetPage.goto(`${base}/feed`);
await passwordSignIn(targetPage);
const targetNav = targetPage.getByRole('navigation', { name: 'ناوبری اصلی' });
check(await visible(targetNav, 30_000), 'her browser opens the workspace app');

/* ---------- The operator, flagged from the server, in /admin ---------- */

const operatorContext = await browser.newContext({ viewport, locale: 'fa-IR', colorScheme: 'light' });
const page = await operatorContext.newPage();
watchConsole(page);
await page.goto(`${base}/feed`);
await enterCode(page, operatorPhone);
const nameBox = page.getByRole('textbox', { name: 'نام و نام خانوادگی' });
await nameBox.waitFor({ timeout: 15_000 });
await nameBox.fill(operatorName);
await page.getByRole('button', { name: 'ساخت حساب و ورود' }).click();
check(await visible(page.getByRole('heading', { name: `${operatorName}، خوش آمدید` }), 15_000), 'the operator signs up');
execSync(`${grantCommand} ${operatorPhone}`, { stdio: 'inherit' });
await page.goto(`${base}/admin`);
check(await visible(page.getByRole('heading', { name: 'رمز عبور مدیر را تعیین کنید' }), 30_000), '/admin asks her to set a password');
await page.getByLabel('رمز عبور', { exact: true }).fill(OPERATOR_PASSWORD);
await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
const nav = page.getByRole('navigation', { name: 'بخش‌های پنل مدیریت' });
check(await visible(nav, 15_000), '…and the admin shell opens after the step-up');

/* ---------- The directory's ⋯ menu ---------- */

const users = page.getByRole('region', { name: 'فهرست کاربران' });
const search = async (phone) => {
  await page.getByLabel('شماره موبایل').fill(phone);
  await page.getByRole('button', { name: 'جستجو', exact: true }).click();
};
await search(targetPhone);
const row = users.getByRole('row').filter({ hasText: targetName });
check(await visible(row, 10_000), 'the directory finds her');
check(await visible(row.getByText('فعال', { exact: true })), '…«فعال»');
const menuOf = async (name) => {
  await users.getByRole('button', { name: `اقدام‌های ${name}` }).click();
  const menu = page.getByRole('menu', { name: `اقدام‌های ${name}` });
  await menu.waitFor({ timeout: 5_000 });
  return menu;
};

let menu = await menuOf(targetName);
for (const item of ['مشاهده نشست‌های فعال', 'تعلیق کاربر', 'اجبار به تغییر رمز عبور']) {
  check(await visible(menu.getByRole('menuitem', { name: item, exact: true })), `her menu offers «${item}»`);
}
await page.screenshot({ path: `${out}/admin_moderation_menu.png` });
await page.keyboard.press('Escape');
check(await eventually(async () => (await page.getByRole('menu').count()) === 0), 'Escape closes the menu');

menu = await menuOf(targetName);
await menu.getByRole('menuitem', { name: 'مشاهده نشست‌های فعال' }).click();
const panel = page.getByRole('dialog', { name: `نشست‌های ${targetName}` });
check(await visible(panel, 10_000), '«مشاهده نشست‌های فعال» opens her sessions beside the directory');
const sessionRows = panel.getByRole('region', { name: 'فهرست نشست‌ها' }).getByRole('row');
check(await eventually(async () => (await sessionRows.count()) === 4, 10_000), '…all three of her active sessions');
await panel.getByRole('button', { name: 'بستن' }).click();
check(await eventually(async () => (await page.getByRole('dialog').count()) === 0), '…and closes again');

/* ---------- Suspension ---------- */

menu = await menuOf(targetName);
await menu.getByRole('menuitem', { name: 'تعلیق کاربر', exact: true }).click();
const suspend = page.getByRole('alertdialog', { name: `تعلیق ${targetName}` });
check(await visible(suspend), 'suspending asks for confirmation');
const confirmSuspend = suspend.getByRole('button', { name: 'تعلیق کاربر', exact: true });
check(await confirmSuspend.isDisabled(), '…and cannot go ahead without a reason');
await suspend.getByLabel('دلیل تعلیق').fill(REASON);
await page.screenshot({ path: `${out}/admin_moderation_suspend.png` });
await confirmSuspend.click();
check(await visible(page.getByRole('status').filter({ hasText: `${targetName} معلق شد` }), 10_000), 'the directory says she was suspended and her sessions closed');
check(await visible(row.getByText('معلق / مسدود', { exact: true })), '…and shows «معلق / مسدود»');

check(await visible(targetPage.getByText(SUSPENDED), 20_000), 'her open browser is signed out at once, with the suspended message');
check((await targetNav.count()) === 0, '…and nothing of the workspace is left on screen');
await targetPage.screenshot({ path: `${out}/moderation_suspended_signin.png` });
const me = await api('GET', '/me', { token: target.accessToken });
check(me.status === 401 && me.body?.code === 'SESSION_REVOKED', 'her access token is refused');
const passwordTry = await api('POST', '/auth/password/login', { body: { phone: targetPhone, password: TARGET_PASSWORD } });
check(passwordTry.status === 401 && passwordTry.body?.code === 'CREDENTIALS_INVALID', '…her password signs nobody in');
await cooledDown(targetPhone);
await enterCode(targetPage, targetPhone);
check(await visible(targetPage.getByText(SUSPENDED), 15_000), '…and an SMS code is refused with the suspended message');

/* ---------- The audit log ---------- */

await nav.getByRole('link', { name: 'گزارش بازرسی' }).click();
const audit = page.getByRole('region', { name: 'رویدادهای گزارش بازرسی' });
const entry = audit.getByRole('row').filter({ hasText: 'تعلیق کاربر' }).first();
check(await visible(entry, 10_000), 'the audit log records the suspension');
check(await visible(entry.getByText(`دلیل: ${REASON}`)), '…with its reason');
check(await visible(entry.getByText(operatorName)), '…who did it');
check(/trace [0-9a-f]{32}/.test((await entry.textContent()) ?? ''), '…and the trace id beside the request id');

/* ---------- Lifting it ---------- */

await nav.getByRole('link', { name: 'کاربران و سشن‌ها' }).click();
await search(targetPhone);
check(await visible(row, 10_000), 'back in the directory');
menu = await menuOf(targetName);
await menu.getByRole('menuitem', { name: 'رفع تعلیق' }).click();
const lift = page.getByRole('alertdialog', { name: `رفع تعلیق ${targetName}` });
await lift.getByRole('button', { name: 'رفع تعلیق', exact: true }).click();
check(await visible(page.getByRole('status').filter({ hasText: `تعلیق ${targetName} برداشته شد` }), 10_000), '«رفع تعلیق» is confirmed');
check(await visible(row.getByText('فعال', { exact: true })), '…and she is «فعال» again');
await targetPage.goto(`${base}/feed`);
await passwordSignIn(targetPage);
check(await visible(targetNav, 30_000), 'she signs in again');

/* ---------- Forcing a new password ---------- */

menu = await menuOf(targetName);
await menu.getByRole('menuitem', { name: 'اجبار به تغییر رمز عبور' }).click();
const force = page.getByRole('alertdialog', { name: 'اجبار به تغییر رمز عبور' });
check(await visible(force), 'forcing a new password asks for confirmation');
check((await force.getByRole('checkbox', { name: /خروج از همه نشست‌ها/ }).getAttribute('aria-checked')) === 'true', '…signing every session out by default');
await force.getByRole('button', { name: 'اجبار به تغییر رمز', exact: true }).click();
check(await visible(page.getByRole('status').filter({ hasText: `${targetName} باید رمز عبور تازه‌ای بگذارد` }), 10_000), 'the directory confirms it');
check(await visible(row.getByText('بازنشانی رمز در انتظار')), '…and marks her password');
check(await visible(targetPage.getByRole('button', { name: 'دریافت کد ورود' }), 20_000), 'her browser is signed out');
check((await targetPage.getByText(SUSPENDED).count()) === 0, '…without the suspended message: she is not suspended');
await passwordSignIn(targetPage);
check(await visible(targetPage.getByText('رمز عبور شما بازنشانی شده است'), 10_000), 'her old password now asks for a new one');

menu = await menuOf(targetName);
await menu.getByRole('menuitem', { name: 'لغو اجبار تغییر رمز' }).click();
await page.getByRole('alertdialog', { name: 'لغو اجبار تغییر رمز' }).getByRole('button', { name: 'لغو اجبار', exact: true }).click();
check(await visible(page.getByRole('status').filter({ hasText: `اجبار تغییر رمز ${targetName} لغو شد` }), 10_000), 'the requirement can be lifted');
await targetPage.getByRole('button', { name: 'ورود', exact: true }).click();
check(await visible(targetNav, 30_000), '…and the same password works again');

/* ---------- Never one's own account ---------- */

await search(operatorPhone);
const selfRow = users.getByRole('row').filter({ hasText: operatorName });
check(await visible(selfRow, 10_000), 'the operator finds herself');
menu = await menuOf(operatorName);
check(await menu.getByRole('menuitem', { name: /^تعلیق کاربر/ }).isDisabled(), '…and cannot suspend her own account');
check(await menu.getByRole('menuitem', { name: /^اجبار به تغییر رمز عبور/ }).isDisabled(), '…or force her own password');
await page.keyboard.press('Escape');

await targetContext.close();
await finish(browser);
