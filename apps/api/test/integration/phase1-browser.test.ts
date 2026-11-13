import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { SmsService, SmsUnavailableError } from '../../src/platform/sms/sms.js';
import { InvitationSmsProcessor } from '../../src/platform/sms/invitation-sms-processor.js';
import {
  bearer,
  createTestApp,
  idempotencyKey,
  localForm,
  ownerWithWorkspace,
  randomPhone,
  signIn,
  type Session,
  type TestApp,
} from './harness.js';

// Opt-in: uses only the disposable integration database, an isolated Next process, and Chromium.
describe.skipIf(process.env.PHASE1_BROWSER !== '1')('Phase 1 browser / real local API', () => {
  let t: TestApp;
  let owner: Session;
  let workspaceId: string;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let web: ChildProcess;
  const base = 'http://127.0.0.1:3139';
  const screenshots =
    process.env.PHASE1_SCREENSHOT_DIR ??
    fileURLToPath(new URL('../../../../docs/phase1/screenshots/', import.meta.url));
  const pageErrors: string[] = [];

  beforeAll(async () => {
    console.info('Phase 1 browser: starting disposable API');
    t = await createTestApp({ COOKIE_SECURE: 'false', PUBLIC_WEB_ORIGIN: base });
    ({ owner } = await ownerWithWorkspace(t, 'فضای نخست آزمایش'));
    const second = await t
      .http()
      .post('/api/v1/workspaces')
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ name: 'فضای فعال آزمایش' });
    expect(second.status).toBe(201);
    workspaceId = second.body.id;
    console.info('Phase 1 browser: starting isolated Next server');
    const cwd = fileURLToPath(new URL('../../../web/', import.meta.url));
    web = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../../../../node_modules/next/dist/bin/next', import.meta.url)),
        'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        '3139',
      ],
      {
        cwd,
        env: {
          ...process.env,
          TASKIN_API_ORIGIN: t.baseUrl,
          NEXT_PUBLIC_DATA_SOURCE: 'api',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        stdio: 'ignore',
      },
    );
    await vi.waitFor(
      async () => {
        expect((await fetch(`${base}/more`)).ok).toBe(true);
      },
      { timeout: 150_000, interval: 1000 },
    );
    console.info('Phase 1 browser: Next server ready');
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      headless: true,
    });
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR' });
    await context.addCookies(
      owner.cookies.split('; ').map((pair) => {
        const split = pair.indexOf('=');
        const name = pair.slice(0, split);
        return {
          name,
          value: pair.slice(split + 1),
          domain: '127.0.0.1',
          path: name.endsWith('_rt') ? '/api/v1/auth' : '/',
          httpOnly: name.endsWith('_rt'),
          sameSite: 'Strict' as const,
        };
      }),
    );
    await context.addInitScript((id: string) => {
      if (!localStorage.getItem('taskin.workspace')) localStorage.setItem('taskin.workspace', id);
    }, workspaceId);
    await context.addInitScript(`
      window.__phase1SignInFlashed = false;
      new MutationObserver(() => {
        if (document.querySelector('input[type="tel"][name="phone"]')) window.__phase1SignInFlashed = true;
      }).observe(document, { childList: true, subtree: true });
    `);
    page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.name));
    page.setDefaultTimeout(30_000);
    await mkdir(screenshots, { recursive: true });
  }, 180_000);
  afterAll(async () => {
    await browser?.close();
    web?.kill();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await t?.close();
  });

  const ready = async () => {
    await page.getByRole('heading', { name: 'بیشتر', exact: true }).waitFor();
  };
  const capture = async (name: string) => {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      const alert = page.getByRole('dialog').getByRole('alert').last();
      if (await alert.isVisible()) await alert.scrollIntoViewIfNeeded();
      const dialog = page.getByRole('dialog');
      const surface = (await dialog.isVisible()) ? dialog : page;
      await page.screenshot({
        path: `${screenshots}/${name}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
        mask: [
          surface.locator('.latin-inline:visible'),
          surface.locator('.truncate.numeric:visible'),
          surface.locator('a[href^="tel:"]:visible'),
        ],
        maskColor: '#667085',
      });
    }
  };

  it('restores /more and direct /tasks with the same workspace and no sign-in flash', async () => {
    await page.goto(`${base}/more`);
    await ready();
    expect(await page.getByRole('textbox', { name: 'شماره موبایل' }).count()).toBe(0);
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.reload();
    await ready();
    expect(new URL(page.url()).pathname).toBe('/more');
    expect(await page.evaluate('window.__phase1SignInFlashed')).toBe(false);
    expect(await page.evaluate('localStorage.getItem("taskin.workspace")')).toBe(workspaceId);
    await page.goto(`${base}/tasks`);
    await page.getByRole('heading', { name: 'همه وظایف', exact: true }).waitFor();
    expect(new URL(page.url()).pathname).toBe('/tasks');
    expect(await page.evaluate('window.__phase1SignInFlashed')).toBe(false);
    expect(await page.getByRole('textbox', { name: 'شماره موبایل' }).count()).toBe(0);
    expect(await page.evaluate('localStorage.getItem("taskin.workspace")')).toBe(workspaceId);
    await page.unroute('**/api/v1/auth/refresh');
  }, 120_000);

  it('shows a retry state for temporary session failure and restores the same route', async () => {
    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE', status: 503 } }),
    );
    await page.goto(`${base}/more`);
    await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).waitFor();
    expect(await page.getByRole('textbox', { name: 'شماره موبایل' }).count()).toBe(0);
    await capture('session-retry');
    await page.unroute('**/api/v1/auth/refresh');
    await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
    await ready();
    expect(new URL(page.url()).pathname).toBe('/more');
  }, 120_000);

  it('keeps invitation delivery feedback, validation values and retry in Persian RTL at 360/390', async () => {
    const phone = randomPhone();
    const created = await t
      .http()
      .post(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ recipients: [{ address: localForm(phone) }], role: 'member' });
    expect(created.status).toBe(201);
    const invitationId = created.body.created[0].id as string;
    await page.goto(`${base}/directory`);
    await page.getByText('پیامک در صف ارسال است.', { exact: true }).first().waitFor();
    await capture('sms-queued');
    const sms = t.app.get(SmsService);
    const original = sms.send.bind(sms);
    let reject = true;
    vi.spyOn(sms, 'send').mockImplementation(async (message) => {
      if (message.template !== 'invite') return original(message);
      if (reject) throw new SmsUnavailableError(['smsir: smsir status 0']);
      return { provider: 'smsir', messageId: '101' };
    });
    await t.flushNotifications();
    await page.reload();
    await page.getByRole('button', { name: 'ارسال دوباره پیامک', exact: true }).first().waitFor();
    await capture('sms-failed');
    await page.getByRole('button', { name: 'دعوت همکار', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'ارسال دوباره پیامک', exact: true }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'انصراف', exact: true }).click();
    await t.admin.query(
      `update invitations set sms_attempts = jsonb_set(sms_attempts, '{0,queuedAt}', to_jsonb((now() - interval '2 minutes')::text)) where id = $1`,
      [invitationId],
    );
    reject = false;
    await page.getByRole('button', { name: 'ارسال دوباره پیامک', exact: true }).click();
    await page.getByText('پیامک در صف ارسال است.', { exact: true }).first().waitFor();
    await t.flushNotifications();
    await page.reload();
    await page.getByText('پیامک ارسال شد.', { exact: true }).first().waitFor();
    await capture('sms-accepted');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 1,
          data: { messageId: 101, deliveryState: 1, deliveryDateTime: 1794528000 },
        }),
      }),
    );
    await t.app.get(InvitationSmsProcessor).report({ workspaceId, id: invitationId, attempt: 2 });
    vi.unstubAllGlobals();
    await page.reload();
    await page.getByText('پیامک تحویل شد.', { exact: true }).first().waitFor();
    await capture('sms-delivered');
    await page.getByRole('button', { name: 'دعوت همکار', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('textbox', { name: 'ایمیل یا شماره موبایل همکاران' })
      .fill('phase1-form@example.test');
    await dialog.getByRole('textbox', { name: 'پیام شخصی (اختیاری)' }).fill('پیام آزمایشی حفظ انتخاب‌ها');
    await page.route('**/api/v1/workspaces/*/invitations', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      expect(route.request().postDataJSON().departmentId).toMatch(/^[0-9a-f-]{36}$/);
      return route.fulfill({
        status: 400,
        json: {
          code: 'VALIDATION_FAILED',
          status: 400,
          errors: [{ field: 'departmentId', message: 'unknown department' }],
        },
      });
    });
    await dialog.getByRole('button', { name: 'ارسال دعوت‌نامه', exact: true }).click();
    await dialog.getByText('دپارتمان انتخاب‌شده معتبر نیست.', { exact: false }).waitFor();
    expect(await dialog.getByRole('textbox', { name: 'پیام شخصی (اختیاری)' }).inputValue()).toBe(
      'پیام آزمایشی حفظ انتخاب‌ها',
    );
    await capture('invitation-validation');
    await page.unroute('**/api/v1/workspaces/*/invitations');
    await dialog.getByRole('button', { name: 'ارسال دعوت‌نامه', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    expect(pageErrors).toEqual([]);
  }, 180_000);

  it('uses the existing sign-in flow after the real server confirms session expiry', async () => {
    const expired = await signIn(t);
    await t.admin.query(
      `update auth_sessions set idle_expires_at = now() - interval '1 minute', absolute_expires_at = now() - interval '1 minute' where id = $1`,
      [expired.sessionId],
    );
    const expiredContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'fa-IR',
    });
    try {
      await expiredContext.addCookies(
        expired.cookies.split('; ').map((pair) => {
          const split = pair.indexOf('=');
          const name = pair.slice(0, split);
          return {
            name,
            value: pair.slice(split + 1),
            domain: '127.0.0.1',
            path: name.endsWith('_rt') ? '/api/v1/auth' : '/',
            httpOnly: name.endsWith('_rt'),
          };
        }),
      );
      const expiredPage = await expiredContext.newPage();
      const refusal = expiredPage.waitForResponse(
        (response) => response.url().endsWith('/api/v1/auth/refresh') && response.status() === 401,
      );
      await expiredPage.goto(`${base}/tasks`);
      expect((await (await refusal).json()).code).toBe('SESSION_REVOKED');
      await expiredPage.getByRole('textbox', { name: 'شماره موبایل' }).waitFor();
      await expiredPage.reload();
      await expiredPage.getByRole('textbox', { name: 'شماره موبایل' }).waitFor();
      const row = await t.admin.query(`select revoke_reason from auth_sessions where id = $1`, [
        expired.sessionId,
      ]);
      expect(row.rows[0]?.revoke_reason).toBe('expired');
    } finally {
      await expiredContext.close();
    }
  }, 120_000);

  it('explicit sign-out and confirmed revoked session stay in the existing sign-in flow after refresh', async () => {
    await page.goto(`${base}/more`);
    await ready();
    await page.getByRole('link', { name: 'حساب من', exact: true }).click();
    await page.getByRole('button', { name: 'خروج از حساب کاربری', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'خروج از حساب', exact: true }).click();
    await page.getByRole('textbox', { name: 'شماره موبایل' }).waitFor();
    await page.reload();
    await page.getByRole('textbox', { name: 'شماره موبایل' }).waitFor();
    const revokedContext = await browser.newContext();
    await revokedContext.addCookies(
      owner.cookies.split('; ').map((pair) => {
        const split = pair.indexOf('=');
        const name = pair.slice(0, split);
        return {
          name,
          value: pair.slice(split + 1),
          domain: '127.0.0.1',
          path: name.endsWith('_rt') ? '/api/v1/auth' : '/',
          httpOnly: name.endsWith('_rt'),
        };
      }),
    );
    const revokedPage = await revokedContext.newPage();
    await revokedPage.goto(`${base}/tasks`);
    await revokedPage.getByRole('textbox', { name: 'شماره موبایل' }).waitFor();
    await revokedContext.close();
  }, 120_000);
});
