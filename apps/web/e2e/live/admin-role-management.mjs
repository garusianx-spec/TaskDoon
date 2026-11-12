/** Local SUPER_ADMIN fixture only; refuses an existing owner and cleans only its own accounts. */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { check, eventually, finish, launch, visible, watchConsole } from '../lib/harness.mjs';
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const apiLog = process.env.API_LOG;
if (!apiLog || !process.env.DATABASE_MIGRATOR_URL)
  throw Error('API_LOG and DATABASE_MIGRATOR_URL are required for isolated fixtures.');
const db = new pg.Client({ connectionString: process.env.DATABASE_MIGRATOR_URL });
await db.connect();
const ownerPhone = '09901819085';
const ownerE164 = '+989901819085';
const targetPhone = `0912${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
const email = `phase2-${randomUUID().slice(0, 8)}@example.test`;
const password = 'Phase2-Administrative-1405!';
const created = [];
let browser;
const sent = new Map();
async function api(method, path, body, token) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}
async function sms(from, phone) {
  const number = phone.startsWith('+') ? phone : `+98${phone.slice(1)}`;
  const masked = `${number.slice(0, 6)}***${number.slice(-4)}`;
  let code;
  if (
    !(await eventually(() => {
      const lines = readFileSync(apiLog)
        .subarray(from)
        .toString('utf8')
        .split('\n')
        .filter((line) => line.includes(`"to":"${masked}"`))
        .join('\n');
      code = [...lines.matchAll(/"text":"کد ورود شما به تسک‌دون: (\d{6})"/g)].at(-1)?.[1];
      return code;
    }, 20_000))
  )
    throw Error('The local console OTP did not arrive.');
  return code;
}
async function signup(phone, fullName) {
  const from = statSync(apiLog).size;
  sent.set(phone, Date.now());
  const asked = await api('POST', '/auth/otp/request', { phone });
  if (asked.status !== 200) throw Error('Fixture OTP request failed.');
  const verified = await api('POST', '/auth/otp/verify', {
    challengeId: asked.body.challengeId,
    code: await sms(from, phone),
  });
  if (verified.body.status !== 'signup_required')
    throw Error('Refusing to reuse an existing fixture account.');
  const result = await api('POST', '/auth/signup', { signupToken: verified.body.signupToken, fullName });
  if (result.status !== 201) throw Error('Fixture signup failed.');
  created.push(result.body.user.id);
  return result;
}
async function mailCode() {
  let code;
  if (
    !(await eventually(async () => {
      const list = await (await fetch('http://localhost:8025/api/v1/messages?limit=100')).json();
      for (const message of list.messages ?? []) {
        if (!message.To?.some((to) => to.Address === email)) continue;
        const body = await (await fetch(`http://localhost:8025/api/v1/message/${message.ID}`)).json();
        code = body.Text?.match(/[A-Za-z0-9_-]{43}/)?.[0];
        if (code) return true;
      }
      return false;
    }, 20_000))
  )
    throw Error('The setup email was not delivered to Mailpit.');
  return code;
}
async function phoneOtp(page) {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, (sent.get(targetPhone) ?? 0) + 62000 - Date.now())),
  );
  await page.goto(`${base}/feed`);
  await page.getByRole('textbox', { name: 'شماره موبایل', exact: true }).fill(targetPhone);
  const from = statSync(apiLog).size;
  sent.set(targetPhone, Date.now());
  await page.getByRole('button', { name: 'دریافت کد ورود', exact: true }).click();
  await page.getByRole('textbox', { name: 'کد ورود', exact: true }).fill(await sms(from, targetPhone));
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
}
try {
  const exists = await db.query('select id from users where phone=$1 and deleted_at is null', [ownerE164]);
  if (exists.rowCount)
    throw Error('Refusing to modify an existing primary owner; use an isolated development database.');
  const targetExists = await db.query('select id from users where phone=$1 and deleted_at is null', [
    `+98${targetPhone.slice(1)}`,
  ]);
  if (targetExists.rowCount)
    throw Error('Refusing to reuse an existing target account; retry with a fresh fixture.');
  const owner = await signup(ownerPhone, 'مالک آزمایشی پلتفرم');
  check(
    (await api('POST', '/auth/password', { newPassword: password }, owner.body.accessToken)).status === 204,
    'owner sets a password before receiving authority',
  );
  const step = await api('POST', '/auth/step-up', { password }, owner.body.accessToken);
  check(step.status === 200, 'owner proves the password for a fresh step-up');
  execFileSync(
    'node',
    [fileURLToPath(new URL('../../../api/dist/cli/platform-admin.js', import.meta.url)), 'grant', ownerPhone],
    { stdio: 'inherit' },
  );
  browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR' });
  const cookies = owner.headers.getSetCookie().map((value) => {
    const [pair] = value.split(';');
    const index = pair.indexOf('=');
    return {
      name: pair.slice(0, index),
      value: pair.slice(index + 1),
      domain: 'localhost',
      path: '/api/v1/auth',
      httpOnly: /HttpOnly/i.test(value),
      secure: false,
    };
  });
  // The readable CSRF cookie is scoped to / by the server.
  for (const cookie of cookies) if (cookie.name.endsWith('csrf')) cookie.path = '/';
  await context.addCookies(cookies);
  const page = await context.newPage();
  watchConsole(page);
  await page.goto(`${base}/admin/roles`);
  check(
    await visible(page.getByRole('heading', { name: 'مدیریت دسترسی‌ها و مدیران', exact: true }), 30_000),
    'only the authenticated super admin reaches role management',
  );
  check(await visible(page.getByText('مالک اصلی · محافظت‌شده')), 'the owner is visibly protected');
  const table = page.getByRole('region', { name: 'فهرست مدیران و دسترسی‌ها' });
  const ownerRow = table.getByRole('row').filter({ hasText: 'مالک آزمایشی پلتفرم' });
  check(
    (await ownerRow.getByRole('button').count()) === 0,
    'owner demotion and suspension controls are absent',
  );
  await page.getByRole('button', { name: 'افزودن مدیر جدید', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'افزودن مدیر جدید', exact: true });
  await dialog.getByLabel('شماره موبایل مدیر').fill(targetPhone);
  await dialog.getByLabel('نام مدیر', { exact: true }).fill('مدیر راه‌اندازی آزمایشی');
  await dialog.getByLabel('ایمیل بازیابی').fill(email);
  await dialog.getByRole('combobox', { name: 'نقش مدیر جدید' }).click();
  await dialog.getByRole('option', { name: 'اپراتور (OPERATOR)' }).click();
  const response = page.waitForResponse(
    (res) => res.url().endsWith('/admin/users/roles') && res.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'افزودن مدیر', exact: true }).click();
  const assigned = await (await response).json();
  created.push(assigned.id);
  await dialog.waitFor({ state: 'detached' });
  const row = table.getByRole('row').filter({ hasText: 'مدیر راه‌اندازی آزمایشی' });
  check(
    await visible(row.getByText('در انتظار راه‌اندازی', { exact: true })),
    'provisioned administrator stays pending setup',
  );
  check(
    await visible(row.getByText('اپراتور', { exact: true })),
    'the selected OPERATOR role is stored and displayed',
  );
  mkdirSync('/tmp/phase2-review', { recursive: true });
  if (process.env.ROLE_UI_CAPTURE !== '0')
    await page.screenshot({ path: '/tmp/phase2-review/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'role management has no page overflow on mobile',
  );
  if (process.env.ROLE_UI_CAPTURE !== '0')
    await page.screenshot({ path: '/tmp/phase2-review/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const targetContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
  const target = await targetContext.newPage();
  watchConsole(target);
  await phoneOtp(target);
  check(
    await visible(target.getByRole('heading', { name: 'راه‌اندازی دسترسی مدیریت', exact: true }), 15000),
    'first OTP opens setup without granting a session',
  );
  check(
    !(await targetContext
      .cookies()
      .then((values) => values.some((value) => value.name.endsWith('taskin_rt')))),
    'pending setup issues no authenticated cookie',
  );
  await target.getByRole('button', { name: 'ارسال کد راه‌اندازی ایمیل' }).click();
  await target.getByLabel('کد راه‌اندازی ایمیل').fill(await mailCode());
  await target.getByLabel('رمز مدیر جدید', { exact: true }).fill(password);
  await target.getByLabel('تکرار رمز مدیر', { exact: true }).fill(password);
  await target.getByRole('button', { name: 'فعال‌سازی دسترسی مدیریت' }).click();
  check(
    await visible(target.getByText('دسترسی مدیریت فعال شد. با کد پیامکی تازه و رمز مدیر وارد شوید.')),
    'verified email and password setup requires a fresh sign-in',
  );
  await page.getByRole('button', { name: 'بازخوانی', exact: true }).click();
  check(await visible(row.getByText('فعال', { exact: true })), 'the owner sees setup completion as ACTIVE');
  for (const action of ['تعلیق', 'رفع تعلیق']) {
    await row.getByRole('button', { name: action, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'تأیید تغییر' }).click();
    check(
      await visible(row.getByText(action === 'تعلیق' ? 'معلق' : 'فعال', { exact: true })),
      `${action} persists in the role list`,
    );
  }
  await row.getByRole('button', { name: 'تغییر نقش' }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'نقش مدیر' }).click();
  await page.getByRole('option', { name: 'مدیر (ADMIN)', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'تأیید تغییر' }).click();
  check(await visible(row.getByText('مدیر', { exact: true })), 'the owner changes OPERATOR to ADMIN');
  await phoneOtp(target);
  check(
    await visible(target.getByRole('heading', { name: 'تأیید رمز مدیر' })),
    'activated admins keep the Phase 1 password challenge',
  );
  await target.getByLabel('رمز مدیر', { exact: true }).fill(password);
  const login = target.waitForResponse((res) => res.url().endsWith('/auth/admin/password') && res.ok());
  await target.getByRole('button', { name: 'تکمیل ورود' }).click();
  const signedIn = await (await login).json();
  const targetStepUp = await api('POST', '/auth/step-up', { password }, signedIn.accessToken);
  check(
    (await api('GET', '/admin/users/roles', undefined, targetStepUp.body.accessToken)).status === 403,
    'an authenticated ADMIN cannot call role management',
  );
  await target.goto(`${base}/admin/roles`);
  check(
    await visible(target.getByRole('heading', { name: 'دسترسی مجاز نیست' }), 15000),
    'the role page denies lower admins',
  );
  check(
    (await target
      .getByRole('navigation')
      .getByRole('link', { name: 'مدیریت دسترسی‌ها و مدیران' })
      .count()) === 0,
    'the administrative navigation hides role management for ADMIN',
  );
  await row.getByRole('button', { name: 'لغو دسترسی مدیریت' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'تأیید تغییر' }).click();
  check(
    await eventually(async () => (await row.count()) === 0),
    'revocation removes the administrator from the list',
  );
  check(
    (await api('GET', '/me', undefined, targetStepUp.body.accessToken)).status === 401,
    'revocation immediately invalidates active administrative sessions',
  );
  const normal = await api('POST', '/auth/password/login', { phone: targetPhone, password });
  check(
    normal.status === 200 &&
      (await api('GET', '/admin/me', undefined, normal.body.accessToken)).status === 404,
    'revoked admin keeps a regular account and its password',
  );
} catch (error) {
  check(false, error instanceof Error ? error.message : String(error));
} finally {
  if (created.length)
    await db.query(
      'update users set is_platform_admin=false, platform_admin_role=null, deleted_at=now() where id=any($1::uuid[])',
      [created],
    );
  await db.end();
  if (browser) await finish(browser);
  else process.exitCode = 1;
}
