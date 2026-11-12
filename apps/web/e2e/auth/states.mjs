/** Isolated UI failure/edge fixtures. No SMS is sent and these are not backend integration evidence. */
import { mkdirSync } from 'node:fs';
import { check, eventually, finish, launch, out, visible } from '../lib/harness.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:3002';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  throw new Error('Auth fixtures are restricted to localhost.');
const output = `${process.env.VISUAL_REVIEW_DIR ?? out}/authentication`;
mkdirSync(output, { recursive: true });
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
let requests = 0;
let verifyMode = 'invalid';
let requestMode = 'success';
let resetWrites = 0;
const problem = (code, status = 400) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({ type: 'about:blank', status, code, title: code }),
});
await page.route('**/api/v1/public/site/documents?kind=page', (route) =>
  route.fulfill({ json: [{ slug: 'privacy' }] }),
);
await page.route('**/api/v1/auth/otp/request', (route) => {
  if (requestMode === 'offline') return route.abort('failed');
  if (requestMode === 'limited') return route.fulfill(problem('RATE_LIMITED', 429));
  requests++;
  return route.fulfill({
    json: {
      challengeId: `00000000-0000-4000-8000-${String(requests).padStart(12, '0')}`,
      codeLength: 8,
      expiresInSeconds: 120,
      resendInSeconds: 45,
    },
  });
});
await page.route('**/api/v1/auth/otp/verify', (route) =>
  route.fulfill(
    problem(
      verifyMode === 'expired'
        ? 'OTP_EXPIRED'
        : verifyMode === 'suspended'
          ? 'ACCOUNT_SUSPENDED'
          : 'OTP_INVALID',
      verifyMode === 'suspended' ? 403 : 400,
    ),
  ),
);
async function capture(name) {
  for (const [suffix, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `${output}/fixture-${name}-${suffix}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  await page.clock.install();
  await page.goto(`${base}/feed`);
  check(
    (await visible(page.getByRole('link', { name: 'حریم خصوصی' }))) &&
      (await page.getByRole('link', { name: 'حریم خصوصی' }).getAttribute('href')) === '/privacy' &&
      (await page.getByRole('link', { name: 'شرایط استفاده' }).count()) === 0,
    'fixture: sign-in links published policies and omits drafts',
  );
  await page.getByRole('textbox', { name: 'شماره موبایل' }).fill('۰۹۱۲۱۲۳۴۵۶۷');
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  const otp = page.getByRole('textbox', { name: 'کد ورود', exact: true });
  await otp.waitFor();
  check(
    (await otp.getAttribute('maxlength')) === '8' && (await otp.getAttribute('inputmode')) === 'numeric',
    'fixture: backend-returned eight-digit OTP uses a numeric mobile keyboard',
  );
  check(
    (await page.locator('.auth-form-heading bdi[dir="ltr"]').textContent()) === '۰۹۱۲ ••• ۴۵۶۷',
    'fixture: confirmation preserves the masked phone order inside RTL copy',
  );
  check(
    await otp.evaluate((node) => node === document.activeElement),
    'fixture: focus moves to the OTP input',
  );
  await otp.fill('۱۲۳۴۵۶۷۸');
  check(
    (await otp.inputValue()) === '12345678',
    'fixture: eight Persian digits normalize without a hardcoded length',
  );
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  check(
    await visible(page.getByRole('alert').filter({ hasText: 'کد واردشده درست نیست' })),
    'fixture: invalid code feedback is announced',
  );
  check(
    await otp.evaluate((node) => Boolean(document.getElementById(node.getAttribute('aria-describedby')))),
    'fixture: invalid input is associated with its error',
  );
  await page.clock.fastForward(121000);
  check(
    await visible(page.getByRole('status').filter({ hasText: 'کد منقضی شده' })),
    'fixture: returned expiry becomes an explicit expired state',
  );
  check(
    (await page.getByRole('button', { name: 'ورود', exact: true }).isDisabled()) &&
      (await otp.getAttribute('readonly')) !== null,
    'fixture: an expired code cannot be submitted or changed',
  );
  check(
    (await page.getByRole('alert').filter({ hasText: 'کد واردشده درست نیست' }).count()) === 0 &&
      (await otp.getAttribute('aria-invalid')) === null,
    'fixture: expiry replaces the old invalid-code feedback',
  );
  await capture('otp-expired');
  requestMode = 'offline';
  await page.getByRole('button', { name: 'ارسال دوباره کد', exact: true }).click();
  check(
    await visible(page.getByRole('alert').filter({ hasText: 'ارتباط با سرور برقرار نشد' })),
    'fixture: expired-step resend failures stay visible',
  );
  requestMode = 'success';
  await page.getByRole('button', { name: 'ارسال دوباره کد', exact: true }).click();
  check(
    await eventually(() => requests === 2 && otp.inputValue().then((value) => value === '')),
    'fixture: resend replaces the challenge and clears the previous code',
  );
  check(
    await page.getByRole('button', { name: /ارسال دوباره تا/ }).isDisabled(),
    'fixture: resend honors the replacement challenge cooldown',
  );
  verifyMode = 'expired';
  await otp.fill('12345678');
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  check(
    (await visible(page.getByRole('status').filter({ hasText: 'کد منقضی شده' }))) &&
      (await page.getByRole('button', { name: 'ورود', exact: true }).isDisabled()),
    'fixture: server expiry is respected even before the client deadline',
  );
  await page.getByRole('button', { name: 'تغییر شماره', exact: true }).click();
  requestMode = 'offline';
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  check(
    await visible(page.getByRole('alert').filter({ hasText: 'ارتباط با سرور برقرار نشد' })),
    'fixture: a failed connection has safe Persian recovery guidance',
  );
  check(
    await page.getByRole('button', { name: 'دریافت کد ورود' }).isEnabled(),
    'fixture: retry is available after a connection failure',
  );
  await capture('offline');
  requestMode = 'limited';
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  check(
    await visible(page.getByRole('alert').filter({ hasText: 'درخواست‌ها بیش از حد مجاز' })),
    'fixture: rate limiting is surfaced without bypassing it',
  );
  await capture('rate-limited');
  requestMode = 'success';
  verifyMode = 'suspended';
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  await otp.fill('12345678');
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  check(
    await visible(page.getByRole('alert').filter({ hasText: 'معلق شده' })),
    'fixture: a suspended account receives specific safe guidance',
  );
  await capture('suspended');

  await page.getByRole('button', { name: 'تغییر شماره', exact: true }).click();
  await page.getByRole('button', { name: 'ورود با رمز عبور', exact: true }).click();
  const mobile = page.getByRole('textbox', { name: 'شماره موبایل' });
  await mobile.fill('123');
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  check(
    (await visible(page.getByRole('alert').filter({ hasText: 'شماره موبایل معتبر نیست' }))) &&
      (await mobile.getAttribute('aria-invalid')) === 'true' &&
      (await page.getByLabel('رمز عبور', { exact: true }).getAttribute('aria-invalid')) === null,
    'fixture: invalid sign-in phone is associated with the phone field',
  );
  await capture('password-phone-error');
  await mobile.fill('09121234567');
  await page.getByRole('button', { name: 'فراموشی رمز عبور' }).click();
  await page.route('**/api/v1/auth/password/forgot', (route) =>
    route.fulfill({
      json: {
        challengeId: '00000000-0000-4000-8000-000000000099',
        codeLength: 8,
        expiresInSeconds: 120,
        resendInSeconds: 45,
      },
    }),
  );
  await page.route('**/api/v1/auth/password/recover', (route) => {
    resetWrites++;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/v1/auth/password/login', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'ارسال کد بازنشانی' }).click();
  const resetCode = page.getByRole('textbox', { name: 'کد بازنشانی' });
  const newPassword = page.getByLabel('رمز عبور تازه', { exact: true });
  const repeatPassword = page.getByLabel('تکرار رمز عبور تازه', { exact: true });
  const save = page.getByRole('button', { name: 'ذخیره رمز و ورود' });
  await resetCode.fill('12');
  await save.click();
  check(
    (await eventually(() => resetCode.getAttribute('aria-invalid').then((value) => value === 'true'))) &&
      (await repeatPassword.getAttribute('aria-invalid')) === null,
    'fixture: an incomplete reset code is associated with the code field',
  );
  await resetCode.fill('12345678');
  await newPassword.fill('short');
  await save.click();
  check(
    (await eventually(() => newPassword.getAttribute('aria-invalid').then((value) => value === 'true'))) &&
      (await repeatPassword.getAttribute('aria-invalid')) === null,
    'fixture: a short replacement password is associated with the new password field',
  );
  await newPassword.fill('Fixture-Only-Password-123!');
  await repeatPassword.fill('Different-Password-123!');
  await save.click();
  check(
    (await eventually(() => repeatPassword.getAttribute('aria-invalid').then((value) => value === 'true'))) &&
      (await newPassword.getAttribute('aria-invalid')) === null,
    'fixture: mismatched confirmation is associated with the confirmation field',
  );
  await capture('recovery-field-error');
  await repeatPassword.fill('Fixture-Only-Password-123!');
  await save.click();
  check(
    await visible(page.getByRole('heading', { name: 'ورود با رمز عبور' })),
    'fixture: successful recovery leaves the consumed-code step before attempting sign-in',
  );
  check(
    await visible(page.getByRole('status').filter({ hasText: 'رمز عبور تازه ذخیره شد' })),
    'fixture: recovery success is preserved if automatic sign-in loses its connection',
  );
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  check(resetWrites === 1, 'fixture: retrying sign-in never replays a consumed password recovery code');
  await page.goto(`${base}/reset-password`);
  await page.getByRole('button', { name: 'ذخیره رمز عبور' }).click();
  check(
    (await visible(page.getByRole('alert').filter({ hasText: 'کد بازنشانی را وارد کنید' }))) &&
      (await page.getByRole('textbox', { name: 'کد بازنشانی' }).getAttribute('aria-invalid')) === 'true' &&
      (await page.getByLabel('تکرار رمز عبور', { exact: true }).getAttribute('aria-invalid')) === null,
    'fixture: token recovery points the missing code error to its own field',
  );
  check(pageErrors.length === 0, 'fixture: all UI failure states are free of uncaught browser exceptions');
} catch (error) {
  check(false, `auth UI fixture stopped: ${error.message}`);
} finally {
  await finish(browser);
}
