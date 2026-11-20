import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page, type Locator } from 'playwright-core';
import {
  bearer,
  createTestApp,
  ownerWithWorkspace,
  STRONG_PASSWORD,
  type Session,
  type TestApp,
} from './harness.js';
const web = process.env.SUPPORT_WEB_URL ?? 'http://localhost:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(web).hostname))
  throw new Error('Support browser fixtures require localhost');
let t: TestApp;
let browser: Browser;
let owner: Session;
let agent: Session;
const output = resolve('../web/e2e/out', `support-${Date.now()}`);
const errors: string[] = [];
const diagnostics: string[] = [];
beforeAll(async () => {
  await mkdir(output, { recursive: true });
  t = await createTestApp(
    {
      PUBLIC_WEB_ORIGIN: web,
      COOKIE_SECURE: 'false',
      S3_ENDPOINT: 'http://127.0.0.1:8333',
      S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:8333',
    },
    { preserveFixtures: true, fixtureKind: 'support' },
  );
  console.info(`Preserved support browser fixtures: ${t.database}; screenshots: ${output}`);
  const a = await ownerWithWorkspace(t, 'Synthetic browser support');
  owner = a.owner;
  const b = await ownerWithWorkspace(t, 'Synthetic browser agent');
  agent = b.owner;
  await t.admin.query("update users set is_platform_admin=true,platform_admin_role='ADMIN' where id=$1", [
    agent.userId,
  ]);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
});
afterAll(async () => {
  await browser?.close();
  await t?.close();
});
async function signedIn(who: Session): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, locale: 'fa-IR' });
  await context.addCookies(
    who.cookies.split('; ').map((pair) => {
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      return {
        name,
        value: pair.slice(i + 1),
        url: web,
        httpOnly: name !== 'taskin_csrf',
        sameSite: 'Lax' as const,
      };
    }),
  );
  // Real local API proxy; responses and cookies come from the isolated app, not mocks.
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: t.baseUrl + url.pathname + url.search });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => {
    const u = new URL(r.url());
    diagnostics.push(`${u.host}${u.pathname}: ${r.failure()?.errorText}`);
  });
  return { context, page };
}
const select = async (page: Page | Locator, label: string, value: string) => {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
};
async function capture(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate('document.documentElement.scrollWidth<=innerWidth')).toBe(true);
    await page.screenshot({ path: resolve(output, name + '-' + width + '.png'), fullPage: true });
  }
}
it('supports real user-agent conversation, retained drafts, safe retries, private notes and mobile RTL', async () => {
  const { page: user } = await signedIn(owner);
  let hideFirstCommit = true;
  // Simulate a lost successful response at the HTTP boundary, preserving the actual committed row.
  await user.route('**/api/v1/support/tickets', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch({ url: t.baseUrl + '/api/v1/support/tickets' });
    if (hideFirstCommit) {
      hideFirstCommit = false;
      return route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        json: { code: 'SERVICE_UNAVAILABLE', status: 503, title: 'Temporary failure' },
      });
    }
    return route.fulfill({ response });
  });
  try {
    await user.goto(web + '/support/tickets');
    await user.getByRole('heading', { name: 'درخواست‌های پشتیبانی من' }).waitFor();
    await capture(user, 'user-list');
    await user.getByRole('button', { name: 'درخواست جدید', exact: true }).click();
    await capture(user, 'new-ticket');
    await user.keyboard.press('Escape');
    expect(await user.getByRole('dialog').count()).toBe(0);
    await user.getByRole('button', { name: 'درخواست جدید', exact: true }).click();
    await user.getByRole('button', { name: 'ثبت درخواست', exact: true }).click();
    await expect.poll(() => user.getByRole('dialog').getByRole('alert').textContent()).toContain('عنوان');
    expect(
      await user
        .getByRole('textbox', { name: 'عنوان درخواست' })
        .evaluate((n) => n === n.ownerDocument.activeElement),
    ).toBe(true);
    const subject = 'QA support ' + randomUUID();
    await user.getByRole('textbox', { name: 'عنوان درخواست' }).fill(subject);
    await user.keyboard.press('Escape');
    await user.getByRole('button', { name: 'ادامه ویرایش' }).click();
    expect(await user.getByRole('textbox', { name: 'عنوان درخواست' }).inputValue()).toBe(subject);
    await select(user.getByRole('dialog'), 'فضای کاری مرتبط', 'Synthetic browser support');
    await select(user.getByRole('dialog'), 'بخش', 'فنی');
    await select(user.getByRole('dialog'), 'اولویت', 'زیاد');
    await user.getByRole('textbox', { name: 'شرح درخواست' }).fill('شرح مصنوعی برای آزمایش مرورگر');
    const chooser = user.waitForEvent('filechooser');
    await user.getByRole('button', { name: 'انتخاب فایل', exact: true }).focus();
    await user.keyboard.press('Enter');
    await (
      await chooser
    ).setFiles({
      name: 'qa-browser.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('synthetic browser file'),
    });
    await user.getByRole('button', { name: 'ثبت درخواست', exact: true }).click();
    await expect.poll(() => user.getByRole('dialog').getByRole('alert').textContent()).toContain('دوباره');
    expect(await user.getByRole('textbox', { name: 'عنوان درخواست' }).inputValue()).toBe(subject);
    expect(await user.getByText('qa-browser.txt', { exact: true }).count()).toBe(1);
    await user.getByRole('button', { name: 'ثبت درخواست', exact: true }).click();
    await user.waitForURL(/\/support\/tickets\/[^/]+$/);
    await user.getByRole('heading', { name: subject }).waitFor();
    const ticketId = new URL(user.url()).pathname.split('/').at(-1)!;
    expect((await t.admin.query('select id from support_tickets where subject=$1', [subject])).rowCount).toBe(
      1,
    );
    expect(
      (await t.admin.query('select id from support_uploads where uploader_id=$1', [owner.userId])).rowCount,
    ).toBe(1);
    const { page: admin } = await signedIn(agent);
    await admin.goto(web + '/admin/tickets');
    const password = admin.getByLabel('رمز عبور', { exact: true });
    await admin.getByRole('heading', { name: 'صف پشتیبانی' }).or(password).waitFor();
    if (await password.isVisible()) {
      await password.fill(STRONG_PASSWORD);
      await admin.getByRole('button', { name: 'تأیید و ادامه' }).click();
    }
    await admin.getByRole('heading', { name: 'صف پشتیبانی' }).waitFor();
    await capture(admin, 'agent-queue');
    await admin
      .getByRole('link')
      .filter({ has: admin.getByRole('heading', { name: subject }) })
      .click();
    await admin.getByRole('heading', { name: subject }).waitFor();
    await select(admin, 'همکار مسئول', 'مالک فضای کاری');
    await admin.getByRole('button', { name: 'ذخیره تغییرات', exact: true }).click();
    await admin.getByText('وضعیت درخواست ذخیره شد.', { exact: true }).waitFor();
    await select(
      admin,
      'پاسخ آماده (پیش از ارسال قابل ویرایش)',
      'سلام، لطفاً جزئیات بیشتری درباره درخواستتان بنویسید تا بتوانیم بررسی کنیم.',
    );
    expect(await admin.getByRole('textbox', { name: 'پاسخ شما' }).inputValue()).toContain('جزئیات');
    await admin.getByRole('textbox', { name: 'پاسخ شما' }).fill('پاسخ واقعی از همکار آزمایشی');
    await admin.getByRole('button', { name: 'ارسال پاسخ', exact: true }).click();
    await admin.getByText('پیام ثبت شد.', { exact: true }).waitFor();
    await user.getByText('پاسخ واقعی از همکار آزمایشی', { exact: true }).waitFor({ timeout: 12000 });
    await admin.getByRole('checkbox', { name: 'یادداشت داخلی (برای کاربر نمایش داده نمی‌شود)' }).check();
    await admin
      .getByRole('textbox', { name: 'متن یادداشت داخلی' })
      .fill('synthetic internal private browser');
    await admin.getByRole('button', { name: 'ثبت یادداشت داخلی', exact: true }).click();
    await admin.getByText('یادداشت داخلی ثبت شد.', { exact: true }).waitFor();
    const direct = await t.http().get(`/api/v1/support/tickets/${ticketId}`).set(bearer(owner)).expect(200);
    expect(JSON.stringify(direct.body)).not.toContain('synthetic internal private browser');
    expect(await user.getByText('synthetic internal private browser', { exact: true }).count()).toBe(0);
    await capture(user, 'user-thread');
    await capture(admin, 'agent-thread');
    await user.setViewportSize({ width: 400, height: 844 });
    expect(await user.evaluate('document.documentElement.scrollWidth<=innerWidth')).toBe(true);
    await user.screenshot({ path: resolve(output, 'user-mobile-light.png'), fullPage: true });
    await user.evaluate("document.documentElement.dataset.theme='dark'");
    await user.screenshot({ path: resolve(output, 'user-mobile-dark.png'), fullPage: true });
    await admin.setViewportSize({ width: 1180, height: 900 });
    await admin.screenshot({ path: resolve(output, 'agent-desktop.png'), fullPage: true });
    await user.getByRole('button', { name: 'بستن درخواست من', exact: true }).click();
    await user.getByRole('dialog').getByRole('button', { name: 'بستن درخواست', exact: true }).click();
    await expect
      .poll(() => user.getByRole('button', { name: 'ارسال پاسخ', exact: true }).isDisabled())
      .toBe(true);
    await user.reload();
    await user.getByRole('heading', { name: subject }).waitFor();
    expect(await user.getByRole('button', { name: 'ارسال پاسخ', exact: true }).isDisabled()).toBe(true);
    expect(errors).toEqual([]);
  } catch (e) {
    console.info('Support browser request failures:', diagnostics);
    await user.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
    throw e;
  }
}, 120000);
