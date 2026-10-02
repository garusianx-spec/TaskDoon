/**
 * The platform super admin, phase 3: moderating a workspace, against a running TaskDoon API.
 *
 *   API_LOG=/path/to/api.log node e2e/live/workspace-moderation.mjs      # BASE_URL defaults to http://localhost:3000
 *
 * Same requirements as the phase 1 and 2 admin suites (console SMS driver logging to `API_LOG`,
 * the live web build proxying `/api/v1` and `/rt`, `GRANT_PLATFORM_ADMIN` to flag the operator).
 *
 * Covers: an owner's workspace with a member who also has a workspace of her own, open in her
 * browser → the operator's workspace list shows «فعال» and a ⋯ menu («مشاهده جزئیات و اعضا»,
 * «انتقال مالکیت», «تعلیق فضای کاری») → a suspension needs a reason, then shows «معلق / مسدود»;
 * the member's open app says so, moves her to her other workspace, and lists the suspended one
 * as unavailable; the API answers WORKSPACE_SUSPENDED → the detail page shows the suspension →
 * «رفع تعلیق» → the quota panel overrides the project limit, which the owner then sees →
 * «انتقال مالکیت» to the member through the picker → the audit log has all of it, with the
 * reasons and trace ids.
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
const INVITE = /"text":"[^"]*?https?:\/\/[^"\s]+\/invite\?token=([^"\s&]+)"/g;
const runId = String(Date.now()).slice(-4);
const used = new Set();
const phoneOf = () => {
  for (;;) {
    const phone = `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
    if (!used.has(phone)) {
      used.add(phone);
      return phone;
    }
  }
};
const ownerPhone = phoneOf();
const memberPhone = phoneOf();
const operatorPhone = phoneOf();
const ownerName = `مالک نظارت ${runId}`;
const memberName = `نسرین وارث ${runId}`;
const operatorName = `ناظر فضاها ${runId}`;
const watchedName = `فضای تحت نظارت ${runId}`;
const ownName = `فضای شخصی ${runId}`;
const MEMBER_PASSWORD = `Ramz-Ozv-${runId}!`;
const OPERATOR_PASSWORD = `Modir-Faza-${runId}!`;
const REASON = 'گزارش محتوای غیرمجاز';
const SUSPENDED = 'این فضای کاری توسط مدیریت تسک‌دون معلق شده است';

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
async function signUp(phone, fullName) {
  const from = logSize();
  const challenge = await api('POST', '/auth/otp/request', { body: { phone } });
  if (challenge.status !== 200) throw new Error(`otp/request ${challenge.status}`);
  const code = await smsAfter(from, OTP, 'sign-in code');
  const verify = await api('POST', '/auth/otp/verify', { body: { challengeId: challenge.body.challengeId, code } });
  if (verify.body?.status !== 'signup_required') throw new Error(`otp/verify ${verify.status}`);
  const signup = await api('POST', '/auth/signup', { body: { signupToken: verify.body.signupToken, fullName } });
  if (signup.status !== 201) throw new Error(`signup ${signup.status}`);
  return signup.body;
}

/* ---------- Setup through the API: the watched workspace, its member, and her own workspace ---------- */

const owner = await signUp(ownerPhone, ownerName);
check((await api('POST', '/auth/password', { token: owner.accessToken, body: { newPassword: `Malek-Ramz-${runId}!` } })).status === 204, 'the owner sets a password');
const watched = await api('POST', '/workspaces', { token: owner.accessToken, body: { name: watchedName }, idempotent: true });
check(watched.status === 201, '…and creates the workspace to be watched');
const watchedId = watched.body.id;

const member = await signUp(memberPhone, memberName);
check((await api('POST', '/auth/password', { token: member.accessToken, body: { newPassword: MEMBER_PASSWORD } })).status === 204, 'the member sets a password');
const own = await api('POST', '/workspaces', { token: member.accessToken, body: { name: ownName }, idempotent: true });
check(own.status === 201, '…and has a workspace of her own');
const ownId = own.body.id;

const inviteFrom = logSize();
const invited = await api('POST', `/workspaces/${watchedId}/invitations`, {
  token: owner.accessToken,
  body: { recipients: [{ address: memberPhone }], role: 'member' },
  idempotent: true,
});
check(invited.status === 201, 'the owner invites her');
const inviteToken = await smsAfter(inviteFrom, INVITE, 'invitation link');
check((await api('POST', '/invitations/accept', { token: member.accessToken, body: { token: decodeURIComponent(inviteToken) } })).status === 200, '…and she joins');

const browser = await launch();
const viewport = { width: 1440, height: 900 };

// Her browser, signed in with her password, on the watched workspace.
const memberContext = await browser.newContext({ viewport, locale: 'fa-IR' });
const memberPage = await memberContext.newPage();
// A request in flight when the suspension lands is refused, and the browser logs that.
watchConsole(memberPage, { allow: [/the server responded with a status of 403/] });
await memberPage.goto(`${base}/feed`);
await memberPage.getByRole('button', { name: 'ورود با رمز عبور' }).click();
await memberPage.getByRole('textbox', { name: 'شماره موبایل' }).fill(memberPhone);
await memberPage.getByLabel('رمز عبور', { exact: true }).fill(MEMBER_PASSWORD);
await memberPage.getByRole('button', { name: 'ورود', exact: true }).click();
check(await visible(memberPage.getByRole('navigation', { name: 'ناوبری اصلی' }), 30_000), 'her browser opens the workspace app');
const activeIs = (name) => memberPage.getByRole('button', { name: new RegExp(`فضای کاری فعال: ${name}`) });
const switcher = () => memberPage.getByRole('button', { name: /تعویض فضای کاری/ });
if (!(await visible(activeIs(watchedName), 3_000))) {
  await switcher().click();
  await memberPage.getByRole('menu', { name: 'تعویض فضای کاری' }).getByRole('menuitem', { name: new RegExp(watchedName) }).click();
}
check(await visible(activeIs(watchedName), 30_000), '…on the watched workspace');

/* ---------- The operator, flagged from the server, in /admin ---------- */

const operatorContext = await browser.newContext({ viewport, locale: 'fa-IR', colorScheme: 'light' });
const page = await operatorContext.newPage();
watchConsole(page);
await page.goto(`${base}/feed`);
const phoneBox = page.getByRole('textbox', { name: 'شماره موبایل' });
await phoneBox.waitFor({ timeout: 30_000 });
await phoneBox.fill(operatorPhone);
const codeFrom = logSize();
await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
await page.getByRole('textbox', { name: 'کد ورود' }).fill(await smsAfter(codeFrom, OTP, 'sign-in code'));
await page.getByRole('button', { name: 'ورود', exact: true }).click();
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

/* ---------- The workspace list and its ⋯ menu ---------- */

await nav.getByRole('link', { name: 'ورک‌اسپیس‌ها و نقش‌ها' }).click();
const list = page.getByRole('region', { name: 'فهرست ورک‌اسپیس‌ها' });
await page.getByLabel('نام یا نشانی ورک‌اسپیس').fill(watchedName);
await page.getByRole('button', { name: 'جستجو', exact: true }).click();
const row = list.getByRole('row').filter({ hasText: watchedName });
check(await visible(row, 10_000), 'the list finds the workspace');
check(await visible(row.getByText('فعال', { exact: true })), '…«فعال»');
const menuOf = async () => {
  await list.getByRole('button', { name: `اقدام‌های ${watchedName}` }).click();
  const menu = page.getByRole('menu', { name: `اقدام‌های ${watchedName}` });
  await menu.waitFor({ timeout: 5_000 });
  return menu;
};
let menu = await menuOf();
for (const item of ['مشاهده جزئیات و اعضا', 'انتقال مالکیت', 'تعلیق فضای کاری']) {
  check(await visible(menu.getByRole('menuitem', { name: item, exact: true })), `its menu offers «${item}»`);
}
await page.screenshot({ path: `${out}/admin_workspaces_menu.png` });

/* ---------- Suspension ---------- */

await menu.getByRole('menuitem', { name: 'تعلیق فضای کاری' }).click();
const suspend = page.getByRole('alertdialog', { name: `تعلیق ${watchedName}` });
check(await visible(suspend), 'suspending asks for confirmation');
const confirmSuspend = suspend.getByRole('button', { name: 'تعلیق فضای کاری', exact: true });
check(await confirmSuspend.isDisabled(), '…and cannot go ahead without a reason');
await suspend.getByLabel('دلیل تعلیق').fill(REASON);
await page.screenshot({ path: `${out}/admin_workspace_suspend.png` });
await confirmSuspend.click();
check(await visible(page.getByRole('status').filter({ hasText: `${watchedName} معلق شد` }), 10_000), 'the list says it was suspended');
check(await visible(row.getByText('معلق / مسدود', { exact: true })), '…and shows «معلق / مسدود»');

check(await visible(memberPage.getByText(SUSPENDED).first(), 20_000), 'the member’s open app says the workspace was suspended');
check(await visible(activeIs(ownName), 20_000), '…and moves her to her own workspace');
await switcher().click();
const suspendedItem = memberPage.getByRole('menu', { name: 'تعویض فضای کاری' }).getByRole('menuitem', { name: new RegExp(watchedName) });
check(await visible(suspendedItem.getByText('معلق؛ فعلاً در دسترس نیست')), '…where the suspended one is listed as unavailable');
check(await suspendedItem.isDisabled(), '…and cannot be opened');
await memberPage.screenshot({ path: `${out}/member_workspace_suspended.png` });
await memberPage.keyboard.press('Escape');
const refused = await api('GET', `/workspaces/${watchedId}`, { token: member.accessToken });
check(refused.status === 403 && refused.body?.code === 'WORKSPACE_SUSPENDED', 'the API answers WORKSPACE_SUSPENDED');
check((await api('GET', `/workspaces/${ownId}`, { token: member.accessToken })).status === 200, '…while her own workspace answers as always');

/* ---------- The detail page: the suspension, lifting it, the quota ---------- */

menu = await menuOf();
await menu.getByRole('menuitem', { name: 'مشاهده جزئیات و اعضا' }).click();
check(await visible(page.getByRole('heading', { level: 1, name: watchedName }), 10_000), '«مشاهده جزئیات و اعضا» opens the workspace');
check(await visible(page.getByRole('note').getByText(REASON)), '…which shows why it is suspended');
await page.getByRole('button', { name: 'رفع تعلیق', exact: true }).click();
const lift = page.getByRole('alertdialog', { name: `رفع تعلیق ${watchedName}` });
await lift.getByRole('button', { name: 'رفع تعلیق', exact: true }).click();
check(await visible(page.getByRole('status').filter({ hasText: 'تعلیق فضای کاری برداشته شد' }), 10_000), '«رفع تعلیق» is confirmed');
check(await eventually(async () => (await api('GET', `/workspaces/${watchedId}`, { token: member.accessToken })).status === 200, 10_000), '…and the members are let back in');

const quota = page.getByRole('region', { name: 'سهمیه‌ها و پلن' });
check(await visible(quota, 10_000), 'the quota panel shows the plan, the limits and what is used');
await quota.getByRole('checkbox', { name: /مقدار سفارشی برای حداکثر پروژه/ }).click();
await quota.getByRole('textbox', { name: 'حداکثر پروژه (پروژه)' }).fill('۹');
await quota.getByLabel('دلیل تغییر').fill('قرارداد ویژه سازمانی');
await page.screenshot({ path: `${out}/admin_workspace_quota.png`, fullPage: true });
await quota.getByRole('button', { name: 'ذخیره پلن و سهمیه‌ها' }).click();
check(await visible(quota.getByText('پلن و سهمیه‌ها ذخیره شد.'), 10_000), 'a project limit is overridden');
check(
  await eventually(async () => (await api('GET', `/workspaces/${watchedId}`, { token: owner.accessToken })).body?.limits?.maxProjects === 9, 10_000),
  '…and the owner’s workspace is held to it',
);

/* ---------- Emergency ownership transfer ---------- */

await page.getByRole('button', { name: 'انتقال مالکیت', exact: true }).click();
const transfer = page.getByRole('alertdialog', { name: `انتقال مالکیت ${watchedName}` });
check(await visible(transfer), 'the transfer dialog lists the members');
check(await transfer.getByRole('radio', { name: new RegExp(ownerName) }).isDisabled(), '…the current owner cannot be picked');
await transfer.getByRole('radio', { name: new RegExp(memberName) }).check();
await transfer.getByLabel('دلیل انتقال').fill('مالک قبلی در دسترس نیست');
await transfer.getByRole('button', { name: 'انتقال مالکیت', exact: true }).click();
check(await visible(page.getByRole('status').filter({ hasText: `مالکیت به ${memberName} منتقل شد` }), 10_000), 'ownership moves to the member');
check(await eventually(async () => (await api('GET', `/workspaces/${watchedId}`, { token: member.accessToken })).body?.ownerId === member.user.id, 10_000), '…who now owns it');

/* ---------- The audit log ---------- */

await nav.getByRole('link', { name: 'گزارش بازرسی' }).click();
const audit = page.getByRole('region', { name: 'رویدادهای گزارش بازرسی' });
const entry = audit.getByRole('row').filter({ hasText: 'تعلیق فضای کاری' }).filter({ hasText: REASON }).first();
check(await visible(entry, 10_000), 'the audit log records the suspension with its reason');
check(/trace [0-9a-f]{32}/.test((await entry.textContent()) ?? ''), '…and its trace id');
for (const action of ['رفع تعلیق فضای کاری', 'تغییر پلن و سهمیه‌ها', 'انتقال مالکیت']) {
  check(await visible(audit.getByText(action, { exact: true }).first()), `…and «${action}»`);
}

await memberContext.close();
await finish(browser);
