/**
 * Phase 4 live verification: platform notices, admin controls, clocks, and overview.
 * Requires the same BASE_URL, API_LOG, GRANT_PLATFORM_ADMIN, and CHROMIUM_PATH as admin.mjs.
 * Broadcast fixtures are always soft-archived, including when a check fails.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const apiLog = process.env.API_LOG;
if (!apiLog) throw new Error('Set API_LOG to the running API console SMS log.');
const grantCommand = process.env.GRANT_PLATFORM_ADMIN ?? `node ${fileURLToPath(new URL('../../../api/dist/cli/platform-admin.js', import.meta.url))} grant`;
const OTP = /"text":"کد ورود شما به تسک‌دون: (\d{6})"/g;
const runId = String(Date.now()).slice(-5);
const phoneOf = () => `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const memberPhone = phoneOf();
let operatorPhone = phoneOf();
while (operatorPhone === memberPhone) operatorPhone = phoneOf();
const memberPassword = `Broadcast-Member-${runId}!`;
const operatorPassword = `Broadcast-Admin-${runId}!`;
const message = `اطلاعیه آزمایش پلتفرم ${runId}`;
let adminToken = null;
const created = new Set();

async function smsAfter(from) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const match = [...readFileSync(apiLog).subarray(from).toString('utf8').matchAll(OTP)].at(-1);
    if (match?.[1]) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('No sign-in SMS code within 20 seconds.');
}
async function api(method, path, { token, body, idempotent } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotent) headers['idempotency-key'] = randomUUID();
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function signup() {
  const from = statSync(apiLog).size;
  const challenge = await api('POST', '/auth/otp/request', { body: { phone: memberPhone } });
  if (challenge.status !== 200) throw new Error(`OTP request ${challenge.status}`);
  const verify = await api('POST', '/auth/otp/verify', { body: { challengeId: challenge.body.challengeId, code: await smsAfter(from) } });
  const result = await api('POST', '/auth/signup', { body: { signupToken: verify.body.signupToken, fullName: `عضو اطلاعیه ${runId}` } });
  if (result.status !== 201) throw new Error(`Signup ${result.status}`);
  return result.body;
}
async function memberLogin(page) {
  await page.goto(`${base}/feed`);
  await page.getByRole('button', { name: 'ورود با رمز عبور' }).click();
  await page.getByRole('textbox', { name: 'شماره موبایل' }).fill(memberPhone);
  await page.getByLabel('رمز عبور', { exact: true }).fill(memberPassword);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await page.getByRole('navigation', { name: 'ناوبری اصلی' }).waitFor({ timeout: 30_000 });
}
async function viewportCheck(page, width, file) {
  await page.setViewportSize({ width, height: 900 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `no page overflow at ${width}px: ${file}`);
  await page.screenshot({ path: `${out}/${file}_${width}.png`, fullPage: true });
}

const member = await signup();
check((await api('POST', '/auth/password', { token: member.accessToken, body: { newPassword: memberPassword } })).status === 204, 'member sets owner password');
const workspaceName = `فضای اطلاعیه ${runId}`;
const workspace = await api('POST', '/workspaces', { token: member.accessToken, body: { name: workspaceName }, idempotent: true });
check(workspace.status === 201, 'member creates the isolated workspace');
const browser = await launch();
try {
  const memberContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const memberPage = await memberContext.newPage();
  watchConsole(memberPage);
  await memberLogin(memberPage);
  const banner = memberPage.getByRole('region', { name: 'اطلاعیه‌های پلتفرم' });
  const operatorContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const page = await operatorContext.newPage();
  watchConsole(page);
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/admin/')) adminToken = request.headers().authorization?.replace(/^Bearer /, '') ?? adminToken;
  });
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/v1/admin/broadcasts') && response.request().method() === 'POST' && response.status() === 201) {
      const body = await response.json().catch(() => null);
      if (body?.id) created.add(body.id);
    }
  });
  await page.goto(`${base}/feed`);
  await page.getByRole('textbox', { name: 'شماره موبایل' }).fill(operatorPhone);
  const codeFrom = statSync(apiLog).size;
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  await page.getByRole('textbox', { name: 'کد ورود' }).fill(await smsAfter(codeFrom));
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await page.getByRole('textbox', { name: 'نام و نام خانوادگی' }).fill(`مدیر اطلاعیه ${runId}`);
  await page.getByRole('button', { name: 'ساخت حساب و ورود' }).click();
  await page.getByRole('heading', { name: new RegExp('خوش آمدید') }).waitFor({ timeout: 15_000 });
  execSync(`${grantCommand} ${operatorPhone}`, { stdio: 'inherit' });
  await page.goto(`${base}/admin/broadcasts`);
  await page.getByLabel('رمز عبور', { exact: true }).fill(operatorPassword);
  await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await page.getByRole('heading', { name: 'اطلاعیه‌های سراسری', exact: true }).waitFor({ timeout: 30_000 });

  await page.getByRole('button', { name: 'ساخت اطلاعیه', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'ساخت اطلاعیه' });
  await dialog.getByLabel('متن اطلاعیه').fill(message);
  check(await visible(dialog.getByRole('region', { name: 'پیش‌نمایش اطلاعیه' }).getByText(message, { exact: false })), 'dialog previews the actual banner strip');
  const response = page.waitForResponse((res) => res.url().endsWith('/admin/broadcasts') && res.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'ساخت اطلاعیه', exact: true }).click();
  const saved = await (await response).json();
  created.add(saved.id);
  check(await visible(banner.getByText(message, { exact: false }), 15_000), 'platform websocket updates the member banner without navigation');
  const welcomePage = await operatorContext.newPage();
  watchConsole(welcomePage);
  await welcomePage.goto(base + '/feed');
  check(await visible(welcomePage.getByRole('region', { name: 'اطلاعیه‌های پلتفرم' }).getByText(message, { exact: false }), 15_000), 'authenticated account without a workspace sees the initial notice');
  await welcomePage.close();
  await viewportCheck(memberPage, 375, 'broadcast_banner');
  await viewportCheck(memberPage, 1280, 'broadcast_banner');
  await banner.getByRole('button', { name: 'بستن اطلاعیه' }).click();
  check(await eventually(async () => !(await visible(banner.getByText(message, { exact: false }), 200))), 'member dismisses the info notice');
  check(await memberPage.evaluate(({ id, updatedAt }) => localStorage.getItem(`${id}:${updatedAt}`) === '1', saved), 'info dismissal uses the version key in localStorage');
  const reloadRead = memberPage.waitForResponse((res) => res.url().endsWith('/broadcasts/active'));
  await memberPage.reload();
  await reloadRead;
  check(!(await visible(banner.getByText(message, { exact: false }), 1_000)), 'info stays dismissed after a reload');

  let row = page.getByRole('row').filter({ hasText: message });
  await row.getByRole('button', { name: 'ویرایش', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'ویرایش اطلاعیه' });
  await dialog.getByLabel('متن اطلاعیه').fill(`${message} — نسخه جدید`);
  await dialog.getByRole('combobox', { name: 'اهمیت اطلاعیه' }).click();
  await page.getByRole('option', { name: 'فوری', exact: true }).click();
  await dialog.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  check(await visible(banner.getByRole('alert').filter({ hasText: 'نسخه جدید' }), 15_000), 'updated version reappears as a critical alert');
  const critical = await api('GET', '/broadcasts/active', { token: member.accessToken });
  const updated = critical.body.items.find((item) => item.id === saved.id);
  await banner.getByRole('button', { name: 'بستن اطلاعیه' }).click();
  check(await memberPage.evaluate(({ id, updatedAt }) => sessionStorage.getItem(`${id}:${updatedAt}`) === '1' && localStorage.getItem(`${id}:${updatedAt}`) === null, updated), 'critical dismissal is session-only');

  const newSessionContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const newSessionPage = await newSessionContext.newPage();
  watchConsole(newSessionPage);
  await memberLogin(newSessionPage);
  check(await visible(newSessionPage.getByRole('alert').filter({ hasText: 'نسخه جدید' }), 15_000), 'critical notice returns in a new browser session');
  await newSessionContext.close();

  const scheduleStart = Date.now() + 12_000;
  const scheduled = await api('POST', '/admin/broadcasts', { token: adminToken, body: { message: message + ' زمان‌بندی', level: 'warning', startsAt: new Date(scheduleStart).toISOString(), expiresAt: new Date(scheduleStart + 14_000).toISOString() } });
  if (scheduled.body?.id) created.add(scheduled.body.id);
  check(scheduled.status === 201, 'admin schedules a future notice');
  check(!(await api('GET', '/broadcasts/active', { token: member.accessToken })).body.items.some((item) => item.id === scheduled.body.id), 'future notice starts hidden');
  check(await visible(banner.getByText(message + ' زمان‌بندی', { exact: false }), 20_000), 'server-relative timer reveals the scheduled notice');
  check(await eventually(async () => !(await visible(banner.getByText(message + ' زمان‌بندی', { exact: false }), 200)), 20_000), 'expiry timer removes the scheduled notice');

  row = page.getByRole('row').filter({ hasText: message }).filter({ hasText: 'نسخه جدید' });
  await row.getByRole('switch').click();
  check(await eventually(async () => !(await api('GET', '/broadcasts/active', { token: member.accessToken })).body.items.some((item) => item.id === saved.id)), 'activation toggle removes the announcement from public results');
  await viewportCheck(page, 375, 'admin_broadcasts');
  await viewportCheck(page, 1280, 'admin_broadcasts');
  await row.getByRole('button', { name: 'بایگانی', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'بایگانی اطلاعیه' });
  check(await visible(confirmation.getByText(`${message} — نسخه جدید`, { exact: true })), 'archive confirmation names the actual notice');
  await confirmation.getByRole('button', { name: 'بایگانی اطلاعیه', exact: true }).click();
  check(await eventually(async () => (await page.getByRole('row').filter({ hasText: message }).filter({ hasText: 'نسخه جدید' }).count()) === 0), 'archived announcement leaves the active management list');

  await page.getByRole('link', { name: 'نمای کلی پلتفرم', exact: true }).click();
  check(await visible(page.getByRole('heading', { name: 'سلامت سرویس‌ها', exact: true }), 15_000), 'overview shows infrastructure health');
  check(await visible(page.getByRole('region', { name: 'وضعیت صف‌ها' }), 15_000), 'overview shows queue counts');
  await viewportCheck(page, 375, 'admin_overview');
  await viewportCheck(page, 1280, 'admin_overview');
  await page.getByRole('button', { name: 'بازخوانی وضعیت' }).click();
  check(await eventually(async () => (await api('GET', '/admin/health', { token: adminToken })).status === 200), 'health remains available after refresh');
} finally {
  if (adminToken) for (const id of created) await api('DELETE', `/admin/broadcasts/${id}`, { token: adminToken }).catch(() => undefined);
  if (workspace.status === 201) await api('DELETE', `/workspaces/${workspace.body.id}`, { token: member.accessToken, body: { confirmName: workspaceName } }).catch(() => undefined);
  await finish(browser);
}

