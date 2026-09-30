/**
 * The platform super admin against a running TaskDoon API (phase 1).
 *
 *   API_LOG=/path/to/api.log node e2e/live/admin.mjs      # BASE_URL defaults to http://localhost:3000
 *
 * Needs what the live flow needs (console SMS driver logging to `API_LOG`, the live web build
 * proxying `/api/v1`), plus a way to flag an account as platform admin, which no API route can
 * do: `GRANT_PLATFORM_ADMIN` is the command that does it (the phone is appended), by default the
 * CLI of a local API build (`node apps/api/dist/cli/platform-admin.js grant`, which reads
 * DATABASE_MIGRATOR_URL). In CI it runs inside the API container.
 *
 * Covers: a member and her workspace set up through the API → /admin's own sign-in card → an
 * operator signs up in the workspace app, is flagged by the CLI, and /admin (same session) has
 * her set a password and step up → the directory finds the member by phone →
 * her profile shows her workspace and exact role → her session is ended from the session
 * inspector (her token stops working) → her channel's messages are read, with a type filter →
 * a reset code is issued, shown once, and used on /reset-password → the audit log lists all of
 * it → workspaces and the role matrix → a light and a dark screenshot. Finally the member signs
 * in at /admin herself and gets the same 404 as any unknown address, and the workspace app she
 * uses has no link to /admin anywhere. Last, the operator signs in with her password instead: the
 * panel asks for an SMS code once, then the step-up.
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
const memberPhone = phoneOf();
let operatorPhone = phoneOf();
while (operatorPhone === memberPhone) operatorPhone = phoneOf();
const memberName = `مریم پایش ${runId}`;
const operatorName = `اپراتور پلتفرم ${runId}`;
const workspaceName = `فضای پایش ${runId}`;
const channelName = 'اطلاعیه‌های داخلی';
const OPERATOR_PASSWORD = `Modir-Platform-${runId}!`;
const MEMBER_PASSWORD = `Ramz-Tazeh-${runId}!`;

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

/** A new account by SMS code, without a browser. */
let lastCodeAt = 0;
async function signUp(phone, fullName) {
  const from = logSize();
  lastCodeAt = Date.now();
  const challenge = await api('POST', '/auth/otp/request', { body: { phone } });
  if (challenge.status !== 200) throw new Error(`otp/request ${challenge.status}`);
  const code = await smsAfter(from, OTP, 'sign-in code');
  const verify = await api('POST', '/auth/otp/verify', { body: { challengeId: challenge.body.challengeId, code } });
  if (verify.body?.status !== 'signup_required') throw new Error(`otp/verify ${verify.status}`);
  const signup = await api('POST', '/auth/signup', { body: { signupToken: verify.body.signupToken, fullName } });
  if (signup.status !== 201) throw new Error(`signup ${signup.status}`);
  return signup.body;
}

/** When each number was last sent a code: it may ask for another one a minute later. */
const codeSentAt = new Map();
const cooledDown = (phone) => new Promise((resolve) => setTimeout(resolve, Math.max(0, (codeSentAt.get(phone) ?? 0) + 62_000 - Date.now())));

/** Phone → code on a sign-in card (no sign-up step). */
async function signInAt(page, phone) {
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

/* ---------- Setup through the API: a member, her workspace and a channel with messages ---------- */

const member = await signUp(memberPhone, memberName);
const memberCodeAt = lastCodeAt;
// Owners need a password before their first workspace (allowed right after an SMS sign-in).
check((await api('POST', '/auth/password', { token: member.accessToken, body: { newPassword: `Avalin-Ramz-${runId}!` } })).status === 204, 'the member sets her owner password');
const workspace = await api('POST', '/workspaces', { token: member.accessToken, body: { name: workspaceName }, idempotent: true });
check(workspace.status === 201, 'the member creates her workspace');
const channel = await api('POST', `/workspaces/${workspace.body.id}/conversations`, {
  token: member.accessToken,
  body: { kind: 'channel', title: channelName, isPrivate: true },
  idempotent: true,
});
check(channel.status === 201, '…and a private channel');
for (const text of ['جلسه هماهنگی فردا ساعت ده', 'گزارش ماهانه ضمیمه می‌شود']) {
  await api('POST', `/workspaces/${workspace.body.id}/conversations/${channel.body.id}/messages`, {
    token: member.accessToken,
    body: { clientMsgId: randomUUID(), kind: 'text', text },
  });
}
check((await api('GET', '/me', { token: member.accessToken })).status === 200, 'her session works');

/* ---------- The operator: an ordinary account first, then flagged from the server ---------- */

const browser = await launch();
const viewport = { width: 1440, height: 900 };
const operatorContext = await browser.newContext({ viewport, locale: 'fa-IR', colorScheme: 'light' });
const page = await operatorContext.newPage();
watchConsole(page);

await page.goto(`${base}/admin`);
check(await visible(page.getByRole('heading', { name: 'ورود به پنل مدیریت پلتفرم' }), 30_000), '/admin opens its own sign-in card');
check((await page.getByRole('navigation', { name: 'ناوبری اصلی' }).count()) === 0, '…with nothing of the workspace app around it');
// The account is created where accounts are created: the workspace app's sign-in.
await page.goto(`${base}/feed`);
await signInAt(page, operatorPhone);
const nameBox = page.getByRole('textbox', { name: 'نام و نام خانوادگی' });
await nameBox.waitFor({ timeout: 15_000 });
await nameBox.fill(operatorName);
await page.getByRole('button', { name: 'ساخت حساب و ورود' }).click();
check(await visible(page.getByRole('heading', { name: `${operatorName}، خوش آمدید` }), 15_000), 'the operator signs up in the workspace app');
execSync(`${grantCommand} ${operatorPhone}`, { stdio: 'inherit' });

// Same browser, same session: /admin restores it, no second code.
await page.goto(`${base}/admin`);
check(await visible(page.getByRole('heading', { name: 'رمز عبور مدیر را تعیین کنید' }), 30_000), 'once flagged, /admin asks an operator without a password to set one');
await page.getByLabel('رمز عبور', { exact: true }).fill(OPERATOR_PASSWORD);
await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
const nav = page.getByRole('navigation', { name: 'بخش‌های پنل مدیریت' });
check(await visible(nav, 15_000), 'after the step-up the admin shell opens');
for (const section of ['کاربران و سشن‌ها', 'رصد پیام‌ها و گروه‌ها', 'ورک‌اسپیس‌ها و نقش‌ها', 'گزارش بازرسی']) {
  check(await visible(nav.getByRole('link', { name: section })), `…with «${section}»`);
}
check(await eventually(async () => new URL(page.url()).pathname === '/admin/users'), '…on the user directory');

/* ---------- Directory → profile → sessions ---------- */

await page.getByLabel('شماره موبایل').fill(memberPhone);
await page.getByRole('button', { name: 'جستجو', exact: true }).click();
const users = page.getByRole('region', { name: 'فهرست کاربران' });
const memberLink = users.getByRole('link', { name: memberName });
check(await visible(memberLink, 10_000), 'the directory finds the member by phone');
check(await eventually(async () => (await users.getByRole('row').count()) === 2), '…and only her');
await page.screenshot({ path: `${out}/admin_users.png` });
await memberLink.click();
check(await visible(page.getByRole('heading', { level: 1, name: memberName }), 10_000), 'her profile opens');
const memberships = page.getByRole('region', { name: 'عضویت در ورک‌اسپیس‌ها' });
check(await visible(memberships.getByRole('link', { name: workspaceName })), '…with her workspace');
check(await visible(memberships.getByText('مالک سازمان')), '…and her exact role there');

const sessions = page.getByRole('region', { name: 'فهرست نشست‌ها' });
check(await visible(sessions.getByText('فعال', { exact: true }).first()), 'the session inspector lists her active session');
await page.screenshot({ path: `${out}/admin_profile.png`, fullPage: true });
await sessions.getByRole('button', { name: 'پایان نشست' }).first().click();
const confirm = page.getByRole('alertdialog', { name: 'پایان این نشست' });
await confirm.getByRole('button', { name: 'پایان نشست' }).click();
check(await visible(page.getByText('نشست پایان یافت.')), 'ending it is confirmed');
check(await eventually(async () => (await api('GET', '/me', { token: member.accessToken })).status === 401), '…and her token stops working at once');
check(await visible(sessions.getByText('مدیر پلتفرم').first()), '…the session shows it was ended by a platform admin');

/* ---------- Conversations and messages ---------- */

const conversations = page.getByRole('region', { name: 'فهرست گفتگوها' });
await conversations.getByRole('link', { name: channelName }).click();
check(await visible(page.getByRole('heading', { level: 1, name: channelName }), 10_000), 'her channel opens in the inspector');
const messages = page.getByRole('list', { name: 'پیام‌های گفتگو' });
check(await visible(messages.getByText('گزارش ماهانه ضمیمه می‌شود')), '…with its messages');
check(await eventually(async () => (await messages.getByRole('listitem').count()) === 2), '…both of them');
await page.screenshot({ path: `${out}/admin_conversation.png` });
await page.getByRole('combobox', { name: 'نوع پیام' }).click();
await page.getByRole('option', { name: 'پیام صوتی' }).click();
await page.getByRole('button', { name: 'اعمال فیلتر' }).click();
check(await visible(page.getByText('موردی پیدا نشد.')), 'filtering by voice messages leaves none');
await page.getByRole('button', { name: 'حذف فیلترها' }).click();
check(await eventually(async () => (await messages.getByRole('listitem').count()) === 2), 'clearing the filter brings them back');

/* ---------- A password reset code, shown once ---------- */

await page.getByRole('link', { name: 'پروفایل کاربر' }).click();
await page.getByRole('button', { name: 'بازنشانی رمز عبور' }).click();
const reset = page.getByRole('dialog', { name: 'بازنشانی رمز عبور' });
await reset.getByRole('radio', { name: /نمایش یک‌باره کد/ }).check();
await reset.getByRole('button', { name: 'صدور کد بازنشانی' }).click();
const linkBox = reset.getByLabel('پیوند بازنشانی');
check(await visible(linkBox), 'the reset code and its link are shown once');
const resetLink = (await linkBox.textContent())?.trim() ?? '';
check(/\/reset-password\?token=[A-Za-z0-9_-]{43}$/.test(resetLink), '…a single-use link to /reset-password');
await page.screenshot({ path: `${out}/admin_reset.png` });
await reset.getByRole('button', { name: 'متوجه شدم' }).click();
await page.getByRole('button', { name: 'بازنشانی رمز عبور' }).click();
check(!(await visible(page.getByLabel('پیوند بازنشانی'), 1000)), 'reopening the dialog does not show the code again');
await page.keyboard.press('Escape');

const resetContext = await browser.newContext({ viewport, locale: 'fa-IR' });
const resetPage = await resetContext.newPage();
watchConsole(resetPage);
await resetPage.goto(resetLink.replace(/^https?:\/\/[^/]+/, base));
check(await visible(resetPage.getByRole('heading', { name: 'گذاشتن رمز عبور تازه' }), 15_000), 'the link opens /reset-password, outside the workspace app');
check(await eventually(async () => !new URL(resetPage.url()).search.includes('token')), '…and the code leaves the address bar');
await resetPage.getByLabel('رمز عبور تازه', { exact: true }).fill(MEMBER_PASSWORD);
await resetPage.getByLabel('تکرار رمز عبور', { exact: true }).fill(MEMBER_PASSWORD);
await resetPage.getByRole('button', { name: 'ذخیره رمز عبور' }).click();
check(await visible(resetPage.getByRole('heading', { name: 'رمز عبور تازه ذخیره شد' }), 10_000), 'the member sets her new password with it');
await resetContext.close();

/* ---------- Audit log, workspaces and roles ---------- */

await nav.getByRole('link', { name: 'گزارش بازرسی' }).click();
const audit = page.getByRole('region', { name: 'رویدادهای گزارش بازرسی' });
for (const action of ['خواندن پیام‌ها', 'پایان یک نشست', 'صدور کد بازنشانی رمز', 'مشاهده پروفایل']) {
  check(await visible(audit.getByText(action, { exact: true }).first(), 10_000), `the audit log records «${action}»`);
}
check(await visible(audit.getByText(operatorName).first()), '…with who did it');

await nav.getByRole('link', { name: 'ورک‌اسپیس‌ها و نقش‌ها' }).click();
await page.getByLabel('نام یا نشانی ورک‌اسپیس').fill(workspaceName);
await page.getByRole('button', { name: 'جستجو', exact: true }).click();
await page.getByRole('region', { name: 'فهرست ورک‌اسپیس‌ها' }).getByRole('link', { name: workspaceName }).click();
check(await visible(page.getByRole('region', { name: 'ماتریس دسترسی نقش‌ها' }), 10_000), 'a workspace shows its roles and permission matrix');
check(await visible(page.getByRole('region', { name: 'اعضای ورک‌اسپیس' }).getByRole('link', { name: memberName })), '…and its members');
await page.screenshot({ path: `${out}/admin_workspace_light.png`, fullPage: true });
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/admin_workspace_dark.png`, fullPage: true });

/* ---------- Everyone else: nothing there, and no way there ---------- */

// Not watched: the 404 the API answers her is the point, and Chrome logs it as a console error.
const memberContext = await browser.newContext({ viewport, locale: 'fa-IR' });
const memberPage = await memberContext.newPage();
// A number can ask for a new code once a minute.
await new Promise((resolve) => setTimeout(resolve, Math.max(0, memberCodeAt + 62_000 - Date.now())));
await memberPage.goto(`${base}/admin`);
await signInAt(memberPage, memberPhone);
check(await visible(memberPage.getByRole('heading', { name: 'این صفحه پیدا نشد' }), 15_000), 'a member who finds /admin sees the same 404 as any unknown address');
await memberPage.goto(`${base}/feed`);
check(await visible(memberPage.getByRole('navigation', { name: 'ناوبری اصلی' }), 30_000), 'her workspace app works as always');
check((await memberPage.locator('a[href^="/admin"]').count()) === 0, '…with no link to /admin anywhere');
await memberContext.close();

/* ---------- The operator with a password: the panel asks for an SMS code once, then the step-up ---------- */

const passwordContext = await browser.newContext({ viewport, locale: 'fa-IR' });
const passwordPage = await passwordContext.newPage();
watchConsole(passwordPage);
await passwordPage.goto(`${base}/admin`);
await passwordPage.getByRole('button', { name: 'ورود با رمز عبور' }).click();
await passwordPage.getByRole('textbox', { name: 'شماره موبایل' }).fill(operatorPhone);
await passwordPage.getByLabel('رمز عبور', { exact: true }).fill(OPERATOR_PASSWORD);
await passwordPage.getByRole('button', { name: 'ورود', exact: true }).click();
check(await visible(passwordPage.getByRole('heading', { name: 'تأیید با کد پیامکی' }), 15_000), 'an admin who signs in with a password is asked for an SMS code first');
check((await passwordPage.getByRole('navigation', { name: 'بخش‌های پنل مدیریت' }).count()) === 0, '…and sees nothing of the panel before it');
await passwordPage.screenshot({ path: `${out}/admin_sms_confirm.png` });
await cooledDown(operatorPhone);
const confirmFrom = logSize();
await passwordPage.getByRole('button', { name: 'ارسال کد تأیید' }).click();
await passwordPage.getByRole('textbox', { name: 'کد تأیید' }).fill(await smsAfter(confirmFrom, OTP, 'confirmation code'));
await passwordPage.getByRole('button', { name: 'تأیید', exact: true }).click();
check(await visible(passwordPage.getByRole('heading', { name: 'تأیید رمز عبور' }), 15_000), '…then the password step-up, as always');
await passwordPage.getByLabel('رمز عبور', { exact: true }).fill(OPERATOR_PASSWORD);
await passwordPage.getByRole('button', { name: 'تأیید و ادامه' }).click();
check(await visible(passwordPage.getByRole('navigation', { name: 'بخش‌های پنل مدیریت' }), 15_000), '…and the panel opens');
await passwordContext.close();

await finish(browser);
