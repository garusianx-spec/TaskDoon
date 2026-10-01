/**
 * Agile tracking against a running TaskDoon API: issue types, estimates and worklogs,
 * dependencies (a cycle refused, the blocked pill, the Done warning) and the backlog.
 *
 *   API_LOG=/path/to/api.log node e2e/live/agile.mjs      # BASE_URL defaults to http://localhost:3000
 *
 * Same requirements as the live flow (console SMS driver logging to `API_LOG`, the live web build
 * proxying `/api/v1`). The account, its project and three tasks are set up through the API; every
 * change made in the browser is then read back from the API, and survives a reload.
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
const runId = String(Date.now()).slice(-4);
const phone = `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const PASSWORD = `Chabok-Ramz-${runId}!`;
const projectName = `پروژه چابک ${runId}`;

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

let token = '';
async function api(method, path, { body, idempotent } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers['idempotency-key'] = randomUUID();
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/* ---------- Setup through the API ---------- */

const from = statSync(apiLog).size;
const challenge = await api('POST', '/auth/otp/request', { body: { phone } });
const code = await smsAfter(from, OTP, 'sign-in code');
const verified = await api('POST', '/auth/otp/verify', { body: { challengeId: challenge.body.challengeId, code } });
const signedUp = await api('POST', '/auth/signup', { body: { signupToken: verified.body.signupToken, fullName: `مدیر چابک ${runId}` } });
token = signedUp.body.accessToken;
await api('POST', '/auth/password', { body: { newPassword: PASSWORD } });
const workspace = (await api('POST', '/workspaces', { body: { name: `فضای چابک ${runId}` }, idempotent: true })).body;
const ws = `/workspaces/${workspace.id}`;
const project = (await api('POST', `${ws}/projects`, { body: { key: `AG${runId}`, name: projectName }, idempotent: true })).body;
const createTask = async (body) => (await api('POST', `${ws}/tasks`, { body: { projectId: project.id, ...body }, idempotent: true })).body;
const database = await createTask({ title: 'طراحی پایگاه داده', type: 'bug', severity: 'high', estimatedMinutes: 120 });
const service = await createTask({ title: 'پیاده‌سازی سرویس گزارش' });
const screen = await createTask({ title: 'صفحه تنظیمات گزارش' });
check(project?.id && database?.type === 'bug' && service?.type === 'task', 'account, project and tasks set up through the API');
const task = async (id) => (await api('GET', `${ws}/tasks/${id}`)).body;
const agile = (id) => `${ws}/projects/${project.id}/tasks/${id}`;

/* ---------- Sign in and open the project board ---------- */

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fa-IR' })).newPage();
watchConsole(page);
await page.goto(`${base}/tasks`);
await page.getByRole('button', { name: 'ورود با رمز عبور' }).click({ timeout: 30_000 });
await page.getByRole('textbox', { name: 'شماره موبایل' }).fill(phone);
await page.getByLabel('رمز عبور', { exact: true }).fill(PASSWORD);
await page.getByRole('button', { name: 'ورود', exact: true }).click();
check(await visible(page.getByRole('navigation', { name: 'ناوبری اصلی' }), 30_000), 'signed in');
await page.getByRole('navigation', { name: 'درخت پروژه‌ها' }).getByRole('button', { name: projectName }).first().click();

const board = page.getByRole('application', { name: 'بورد کانبان وظایف' });
const card = (title) => board.getByRole('group', { name: title });
const dialog = page.getByRole('dialog', { name: 'جزئیات وظیفه' });
const openCard = async (title) => {
  await card(title).locator('h4').click();
  await visible(dialog);
};
const closeDialog = async () => {
  await page.keyboard.press('Escape');
  await eventually(async () => (await dialog.count()) === 0);
};
const pick = async (scope, combobox, option) => {
  await scope.getByRole('combobox', { name: combobox, exact: true }).click();
  await page.getByRole('option', { name: option }).first().click();
};

check(await eventually(async () => (await card(/طراحی پایگاه داده/).getByRole('img', { name: /باگ.*زیاد/ }).count()) === 1, 15_000), 'a bug from the API shows its glyph and severity');
check((await card(/پیاده‌سازی سرویس گزارش/).getByRole('img').count()) === 0, 'a plain task shows none');

/* ---------- Type in the composer ---------- */

await page.getByRole('button', { name: 'وظیفه جدید', exact: true }).click();
const composer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید' });
await composer.getByLabel('عنوان وظیفه').fill('خروجی PDF گزارش');
await pick(composer, 'نوع', 'ویژگی');
await composer.getByRole('button', { name: 'ایجاد وظیفه' }).click();
await visible(dialog);
await closeDialog();
check(
  await eventually(async () => {
    const page1 = (await api('GET', `${ws}/tasks?projectId=${project.id}&limit=200`)).body;
    return page1.items.some((item) => item.title === 'خروجی PDF گزارش' && item.type === 'feature');
  }, 15_000),
  'a feature created in the composer is stored as a feature',
);

/* ---------- Estimate and worklog ---------- */

await openCard(/پیاده‌سازی سرویس گزارش/);
const estimate = dialog.getByLabel('برآورد زمان وظیفه');
await estimate.fill('1h');
await estimate.press('Enter');
check(await eventually(async () => (await task(service.id)).estimatedMinutes === 60, 15_000), 'the estimate is saved');
const timing = dialog.getByRole('region', { name: 'زمان‌سنجی وظیفه' });
await timing.getByRole('button', { name: 'ثبت زمان' }).click();
const worklog = page.getByRole('dialog', { name: 'ثبت زمان کار' });
await worklog.getByLabel('مدت کار').fill('۴۵');
await worklog.getByLabel('یادداشت کار').fill('نوشتن پرس‌وجوها');
await worklog.getByRole('button', { name: 'ثبت', exact: true }).click();
check(
  await eventually(async () => {
    const list = (await api('GET', `${agile(service.id)}/worklogs`)).body;
    return list.totalMinutes === 45 && list.items[0]?.description === 'نوشتن پرس‌وجوها';
  }, 15_000),
  'the worklog is stored with its note',
);
check(await eventually(async () => (await timing.textContent()).includes('۱۵ دقیقه'), 15_000), 'the widget shows the remaining quarter hour');
check((await timing.getByRole('progressbar').getAttribute('aria-valuenow')) === '45', '…and the progress bar at 45 of 60');
await closeDialog();

/* ---------- Dependencies ---------- */

await openCard(/صفحه تنظیمات گزارش/);
let deps = dialog.getByRole('region', { name: 'وابستگی‌های وظیفه' });
await deps.getByRole('button', { name: 'افزودن وابستگی' }).click();
await pick(deps, 'نوع رابطه', 'مسدود شده توسط');
await pick(deps, 'وظیفه پیوندی', new RegExp(service.code));
await deps.getByRole('button', { name: 'پیوند', exact: true }).click();
check(
  await eventually(async () => {
    const links = (await api('GET', `${agile(screen.id)}/dependencies`)).body;
    return links.length === 1 && links[0].type === 'blocked_by' && links[0].task.id === service.id;
  }, 15_000),
  'the link is stored, from this task’s side',
);
check(await eventually(async () => (await deps.textContent()).includes(service.code), 15_000), '…and listed in the dialog');
await closeDialog();
check(await eventually(async () => (await card(/صفحه تنظیمات گزارش/).getByText('مسدود', { exact: true }).count()) === 1, 15_000), 'the blocked card shows its pill');

await openCard(/پیاده‌سازی سرویس گزارش/);
deps = dialog.getByRole('region', { name: 'وابستگی‌های وظیفه' });
check(await eventually(async () => (await deps.textContent()).includes(screen.code), 15_000), 'the other end lists the link too');
await deps.getByRole('button', { name: 'افزودن وابستگی' }).click();
await pick(deps, 'نوع رابطه', 'مسدود شده توسط');
await pick(deps, 'وظیفه پیوندی', new RegExp(database.code));
await deps.getByRole('button', { name: 'پیوند', exact: true }).click();
check(await eventually(async () => (await task(service.id)).blockedByIds.includes(database.id), 15_000), 'a second link: the service waits on the database');
await closeDialog();
const cycle = await api('POST', `${agile(database.id)}/dependencies`, { body: { targetTaskId: screen.id, type: 'blocked_by' } });
check(cycle.status === 409 && cycle.body.code === 'DEPENDENCY_CYCLE', 'the API refuses database ← screen, which would close a cycle');

/* ---------- Done while blocked: allowed, with a warning ---------- */

await board.getByRole('checkbox', { name: /صفحه تنظیمات گزارش/ }).click();
const notice = page.getByRole('status').filter({ hasText: 'هنوز منتظر' });
check(await visible(notice), 'completing a blocked task warns');
check((await notice.textContent()).includes(service.code), '…naming the unfinished blocker');
check(await eventually(async () => (await task(screen.id)).status === 'done', 15_000), '…and the task is done all the same');
await notice.getByRole('button', { name: 'بستن هشدار' }).click();

/* ---------- Backlog ---------- */

await openCard(/طراحی پایگاه داده/);
await dialog.getByRole('button', { name: 'انتقال به بک‌لاگ' }).click();
check(await eventually(async () => (await task(database.id)).isBacklog === true, 15_000), 'moved to the backlog');
await closeDialog();
check(await eventually(async () => (await card(/طراحی پایگاه داده/).count()) === 0), 'it leaves the board');
await page.getByRole('tab', { name: 'بک‌لاگ' }).click();
const backlog = page.getByRole('region', { name: 'بک‌لاگ' });
check(await visible(backlog.getByText('طراحی پایگاه داده')), 'the backlog lists it');
await page.screenshot({ path: `${out}/live_agile_backlog.png` });
await backlog.getByRole('button', { name: `انتقال ${database.code} به بورد` }).click();
check(await eventually(async () => (await task(database.id)).isBacklog === false, 15_000), '«انتقال به بورد» puts it back');
await page.getByRole('tab', { name: 'بورد' }).click();

/* ---------- Everything survives a reload ---------- */

await page.reload();
await page.getByRole('navigation', { name: 'درخت پروژه‌ها' }).getByRole('button', { name: projectName }).first().click({ timeout: 30_000 });
check(await eventually(async () => (await card(/طراحی پایگاه داده/).count()) === 1, 15_000), 'after a reload the database task is on the board');
check((await card(/خروجی PDF گزارش/).getByRole('img', { name: 'ویژگی' }).count()) === 1, '…the feature keeps its glyph');
check((await card(/پیاده‌سازی سرویس گزارش/).getByText('مسدود', { exact: true }).count()) === 1, '…and the service is still blocked by the database');
await page.screenshot({ path: `${out}/live_agile_board.png` });

await finish(browser);
