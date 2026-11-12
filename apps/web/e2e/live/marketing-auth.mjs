/** Real local API/CMS and console-SMS journeys. Never run against production or a real SMS provider. */
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { check, eventually, finish, launch, out, visible } from '../lib/harness.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:3002';
const log = process.env.API_LOG;
if (
  process.env.TASKDOON_E2E_ISOLATED !== '1' ||
  !log ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)
)
  throw new Error('Requires TASKDOON_E2E_ISOLATED=1, localhost BASE_URL and a local console-SMS API_LOG.');
const output = process.env.VISUAL_REVIEW_DIR ?? out;
mkdirSync(`${output}/marketing`, { recursive: true });
mkdirSync(`${output}/authentication`, { recursive: true });
const browser = await launch();
const problems = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR' });
const page = await context.newPage();
const marker = Date.now().toString(36);
const phone = `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const fullName = `همکار آزمون ${marker}`;
const password = `Taskdoon-${randomUUID()}!`;
let token;
const expected = new Set();
page.on('pageerror', (error) => problems.push(error.message));
page.on('response', async (response) => {
  const path = new URL(response.url()).pathname;
  if (
    response.status() >= 400 &&
    !expected.has(`${response.request().method()} ${path} ${response.status()}`)
  )
    problems.push(`Unexpected ${response.status()} ${response.request().method()} ${path}`);
  if (path.startsWith('/api/v1/auth/') && response.ok()) {
    try {
      const result = await response.json();
      token = result.accessToken ?? result.session?.accessToken ?? token;
    } catch {
      /* 204 */
    }
  }
});
async function api(method, path, body, access = token) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(access ? { authorization: `Bearer ${access}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  return { status: response.status, body: raw ? JSON.parse(raw) : null };
}
async function sms(offset, reset = false) {
  let found;
  const pattern = reset
    ? /"text":"کد بازنشانی رمز عبور تسک‌دون: (\d+)"/g
    : /"text":"کد ورود شما به تسک‌دون: (\d+)"/g;
  if (
    !(await eventually(() => {
      found = [...readFileSync(log).subarray(offset).toString('utf8').matchAll(pattern)].at(-1)?.[1];
      return found;
    }, 20000))
  )
    throw new Error('No local console-SMS code received.');
  return found;
}
async function capture(name, section = 'authentication', target = page) {
  for (const [suffix, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    await target.setViewportSize({ width, height });
    await target.evaluate(() => document.fonts.ready);
    await target.evaluate(async () => {
      for (const image of document.images) {
        if (!image.getClientRects().length) continue;
        image.scrollIntoView({ block: 'center', behavior: 'instant' });
        await image.decode();
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await target.screenshot({
      path: `${output}/${section}/${name}-${suffix}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await target.setViewportSize({ width: 1440, height: 1000 });
}
async function requestCode(target, number) {
  await target.getByRole('textbox', { name: 'شماره موبایل' }).fill(number);
  const offset = statSync(log).size;
  const pending = target.waitForResponse(
    (response) => response.url().endsWith('/auth/otp/request') && response.request().method() === 'POST',
  );
  await target.getByRole('button', { name: 'دریافت کد ورود' }).click();
  const challenge = await (await pending).json();
  await target.getByRole('textbox', { name: 'کد ورود' }).waitFor();
  return { challenge, code: await sms(offset), receivedAt: Date.now() };
}
async function verify(target, code) {
  await target.getByRole('textbox', { name: 'کد ورود' }).fill(code);
  await target.getByRole('button', { name: 'ورود', exact: true }).click();
}

try {
  const requests = [];
  page.on('request', (request) => {
    if (/\/api\/v1\/(?:me(?:[/?]|$)|auth\/refresh|workspaces)/.test(request.url()))
      requests.push(request.url());
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  check(
    (await page.getByRole('heading', { level: 1 }).count()) === 1,
    'homepage has one meaningful CMS-rendered H1',
  );
  check(requests.length === 0, 'public homepage does not initialize authentication or tenant data');
  const faqs = await (await fetch(`${base}/api/v1/public/site/faqs`)).json();
  check(
    faqs.length > 0 && (await visible(page.getByRole('button', { name: faqs[0].title }))),
    'actual published FAQ documents render on the homepage',
  );
  const seal = page.locator('a[href^="https://trustseal.enamad.ir/"]');
  check(
    (await seal.getAttribute('rel')) === 'noopener' &&
      (await seal.getAttribute('referrerpolicy')) === 'origin' &&
      (await seal.getAttribute('target')) === '_blank',
    'eNamad retains its origin referrer policy without noreferrer',
  );
  const sealOrigin = 'https://trustseal.enamad.ir';
  let sealReferer;
  await context.route(`${sealOrigin}/**`, async (route) => {
    sealReferer = await route.request().headerValue('referer');
    await route.fulfill({
      contentType: 'text/html',
      body: '<title>Verification destination fixture</title>',
    });
  });
  const [verification] = await Promise.all([page.waitForEvent('popup'), seal.click()]);
  check(
    new URL(verification.url()).origin === sealOrigin &&
      sealReferer === new URL('/', base).href &&
      (await verification.evaluate(() => window.opener === null)),
    'browser sends the origin to the intercepted eNamad tab and protects its opener',
  );
  await verification.close();
  await context.unroute(`${sealOrigin}/**`);
  check(
    (await page.getByText('شخصیت نمونه', { exact: false }).count()) === 0,
    'sample testimonials are not presented as customer proof',
  );
  const journey = page.getByRole('tablist', { name: 'از گفتگو تا پیشرفت پروژه' });
  await page.getByRole('button', { name: 'تبدیل پیام به وظیفه' }).click();
  check(
    await journey
      .getByRole('tab')
      .nth(1)
      .evaluate((node) => node === document.activeElement),
    'walkthrough moves keyboard focus to the task step',
  );
  await page.getByRole('textbox', { name: 'عنوان وظیفهٔ نمونه' }).fill('پیگیری تصمیم واقعی تیم');
  await journey.getByRole('tab').last().click();
  const projectPanel = page.locator('.product-journey').getByRole('tabpanel', { name: /پروژه/ });
  check(
    (await visible(projectPanel.getByRole('heading', { name: 'بازبینی صفحهٔ معرفی محصول' }))) &&
      (await projectPanel.getByRole('heading', { name: 'پیگیری تصمیم واقعی تیم' }).count()) === 0,
    'a task draft leaves the board unchanged until submitted',
  );
  await journey.getByRole('tab').nth(1).click();
  check(
    (await page.getByRole('textbox', { name: 'عنوان وظیفهٔ نمونه' }).inputValue()) ===
      'پیگیری تصمیم واقعی تیم',
    'the unsent task draft survives changing tabs',
  );
  await page.getByRole('button', { name: 'ساخت وظیفه در پیش‌نمایش' }).click();
  check(
    await visible(page.getByRole('heading', { name: 'پیگیری تصمیم واقعی تیم' })),
    'the walkthrough carries the edited task into project tracking',
  );
  await page.getByRole('button', { name: 'تکمیل وظیفهٔ نمونه' }).click();
  check(
    await visible(page.getByText('وظیفه به ستون انجام‌شده منتقل شد.')),
    'the interactive task moves to done',
  );
  await journey.getByRole('tab').last().focus();
  await page.keyboard.press('Home');
  check(
    (await journey.getByRole('tab').first().getAttribute('aria-selected')) === 'true',
    'walkthrough supports keyboard navigation in RTL',
  );
  for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `homepage fits ${width}px`,
    );
  }
  await page.evaluate(() =>
    localStorage.setItem('taskin.theme', JSON.stringify({ mode: 'dark', accent: 'teal' })),
  );
  await page.reload({ waitUntil: 'networkidle' });
  check(
    await page
      .locator('.public-surface')
      .evaluate(
        (node) =>
          getComputedStyle(node).backgroundColor === 'rgb(255, 255, 255)' &&
          getComputedStyle(node).getPropertyValue('--brand-600').trim() === '53 56 205',
      ),
    'public surface remains light and indigo under a saved dark/teal workspace theme',
  );
  check(
    await page.evaluate(() => JSON.parse(localStorage.getItem('taskin.theme')).mode === 'dark'),
    'the workspace theme preference is preserved',
  );
  await capture('home', 'marketing');
  for (const path of [
    '/features',
    '/features/task-management',
    '/pricing',
    '/about',
    '/contact',
    '/faq',
    '/blog',
    '/help',
    '/demo-request',
  ]) {
    const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    check(
      response.status() === 200 && (await page.getByRole('heading', { level: 1 }).count()) === 1,
      `${path} retains a public route and page heading`,
    );
    await page.setViewportSize({ width: 360, height: 800 });
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${path} fits a narrow mobile viewport`,
    );
    await capture(path === '/features/task-management' ? 'feature-detail' : path.slice(1), 'marketing');
  }

  await page.goto(`${base}/feed`);
  await page.getByRole('textbox', { name: 'شماره موبایل' }).waitFor();
  for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `sign-in fits ${width}px`,
    );
  }
  await capture('entry');
  await page.getByRole('textbox', { name: 'شماره موبایل' }).fill('۱۲۳');
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  check(
    await visible(page.getByRole('alert').filter({ hasText: 'شماره موبایل معتبر نیست' })),
    'invalid phone feedback is accessible before a request is sent',
  );
  const { code, challenge, receivedAt } = await requestCode(page, phone);
  check(
    (await page.getByRole('textbox', { name: 'کد ورود' }).getAttribute('maxlength')) ===
      String(challenge.codeLength),
    'OTP length comes from the real backend',
  );
  check(
    !(await page.locator('.auth-form-heading').textContent()).includes(phone),
    'OTP confirmation masks the phone number',
  );
  check(
    await page.getByRole('button', { name: /ارسال دوباره تا/ }).isDisabled(),
    'resend remains disabled during the backend cooldown',
  );
  await capture('otp');
  expected.add('POST /api/v1/auth/otp/verify 400');
  const wrong = code === '0'.repeat(code.length) ? '1'.repeat(code.length) : '0'.repeat(code.length);
  await verify(page, wrong);
  check(
    await visible(page.getByRole('alert').filter({ hasText: 'کد واردشده درست نیست' })),
    'the actual API rejects an incorrect OTP with Persian feedback',
  );
  await capture('otp-invalid');
  const persian = code.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  await page.getByRole('textbox', { name: 'کد ورود' }).evaluate(
    (input, value) =>
      input.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: (() => {
            const data = new DataTransfer();
            data.setData('text/plain', value);
            return data;
          })(),
        }),
      ),
    persian.split('').join(' '),
  );
  check(
    (await page.getByRole('textbox', { name: 'کد ورود' }).inputValue()) === code,
    'formatted Persian OTP paste is normalized without truncation',
  );
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await page.getByRole('textbox', { name: 'نام و نام خانوادگی' }).waitFor();
  await capture('signup');
  await page.getByRole('textbox', { name: 'نام و نام خانوادگی' }).fill(fullName);
  await page.getByRole('button', { name: 'ساخت حساب و ورود' }).click();
  await page.getByRole('textbox', { name: 'نام فضای کاری' }).waitFor();
  await capture('first-workspace');
  await page.getByRole('textbox', { name: 'نام فضای کاری' }).fill(`تیم طراحی ${marker}`);
  await page.getByLabel('رمز مدیر', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ساخت فضای کاری', exact: true }).click();
  check(
    await visible(page.getByRole('navigation', { name: 'ناوبری اصلی' }), 30000),
    'registration creates a real workspace through the existing owner-password flow',
  );
  check(
    await page.evaluate(
      () =>
        document.documentElement.dataset.theme === 'dark' &&
        document.documentElement.dataset.accent === 'teal',
    ),
    'the authenticated workspace retains its saved theme',
  );
  const oldToken = token;
  check(
    await page.evaluate((value) => !Object.values(localStorage).some((item) => item.includes(value)), token),
    'access token is not persisted in localStorage',
  );
  await page.reload();
  check(
    await visible(page.getByRole('navigation', { name: 'ناوبری اصلی' }), 30000),
    'session restoration returns to the actual workspace',
  );

  const secondContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'fa-IR',
  });
  const second = await secondContext.newPage();
  await second.goto(`${base}/feed`);
  await second.getByRole('button', { name: 'ورود با رمز عبور', exact: true }).click();
  await capture('password', 'authentication', second);
  await second.getByRole('textbox', { name: 'شماره موبایل' }).fill(phone);
  await second.getByLabel('رمز عبور', { exact: true }).fill(password);
  await second.getByRole('button', { name: 'نمایش رمز عبور', exact: true }).click();
  check(
    (await second.getByLabel('رمز عبور', { exact: true }).getAttribute('type')) === 'text',
    'password visibility is an accessible explicit control',
  );
  await second.getByRole('button', { name: 'پنهان کردن رمز عبور', exact: true }).click();
  await second.getByLabel('رمز عبور', { exact: true }).fill('Incorrect-Password-123!');
  await second.getByRole('button', { name: 'ورود', exact: true }).click();
  check(
    await visible(second.getByRole('alert').filter({ hasText: 'شماره موبایل یا رمز عبور درست نیست' })),
    'wrong password does not expose account existence',
  );
  await second.getByLabel('رمز عبور', { exact: true }).fill(password);
  await second.getByRole('button', { name: 'ورود', exact: true }).click();
  check(
    await visible(second.getByRole('navigation', { name: 'ناوبری اصلی' }), 30000),
    'eligible ordinary account can sign in with its password',
  );
  await secondContext.close();

  const recoverContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'fa-IR',
  });
  const recovery = await recoverContext.newPage();
  await recovery.goto(`${base}/feed`);
  await recovery.getByRole('button', { name: 'ورود با رمز عبور', exact: true }).click();
  await recovery.getByRole('button', { name: 'فراموشی رمز عبور' }).click();
  await capture('forgot-password', 'authentication', recovery);
  await recovery.getByRole('textbox', { name: 'شماره موبایل' }).fill(phone);
  // Honor the actual shared per-phone cooldown; do not bypass rate limiting or send real SMS.
  let remaining = Math.max(0, receivedAt + challenge.resendInSeconds * 1000 - Date.now() + 500);
  while (remaining > 0) {
    const delay = Math.min(remaining, 30000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    remaining -= delay;
  }
  const resetOffset = statSync(log).size;
  await recovery.getByRole('button', { name: 'ارسال کد بازنشانی', exact: true }).click();
  const resetCode = recovery.getByRole('textbox', { name: 'کد بازنشانی' });
  await resetCode.waitFor();
  await capture('password-recovery', 'authentication', recovery);
  await resetCode.fill(await sms(resetOffset, true));
  expected.add('POST /api/v1/auth/refresh 401'); // The first device is deliberately revoked by recovery.
  const newPassword = `Recovered-${randomUUID()}!`;
  await recovery.getByLabel('رمز عبور تازه', { exact: true }).fill(newPassword);
  await recovery.getByLabel('تکرار رمز عبور تازه', { exact: true }).fill('Mismatch-123!');
  await recovery.getByRole('button', { name: 'ذخیره رمز و ورود' }).click();
  check(
    await visible(recovery.getByRole('alert').filter({ hasText: 'تکرار رمز عبور با خود آن یکی نیست' })),
    'password mismatch is caught before a recovery mutation',
  );
  await recovery.getByLabel('تکرار رمز عبور تازه', { exact: true }).fill(newPassword);
  await recovery.getByRole('button', { name: 'ذخیره رمز و ورود' }).click();
  check(
    await visible(recovery.getByRole('navigation', { name: 'ناوبری اصلی' }), 30000),
    'real API recovery saves the password and returns to the workspace',
  );
  check(
    (await api('GET', '/me', undefined, oldToken)).status === 401,
    'password recovery invalidates the old session on the server',
  );
  await recoverContext.close();

  await page.goto(`${base}/reset-password`);
  await page.getByRole('textbox', { name: 'کد بازنشانی', exact: true }).waitFor();
  await capture('token-recovery');
  check(
    (await page.getByRole('button', { name: 'نمایش رمز عبور تازه', exact: true }).count()) === 1,
    'token recovery shares the accessible password controls',
  );
  check(
    problems.length === 0,
    `primary browser has no unexpected HTTP failures or uncaught errors (${problems.length})`,
  );
} catch (error) {
  check(false, `marketing/auth journey stopped: ${error.message}`);
} finally {
  writeFileSync(
    `${output}/marketing-auth-results.json`,
    JSON.stringify({ mode: 'real local API/database, console SMS; no production access', problems }, null, 2),
  );
  for (const problem of problems) console.log(`BROWSER ${problem}`);
  await finish(browser);
}
