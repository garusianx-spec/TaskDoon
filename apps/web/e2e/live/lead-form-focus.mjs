import { base, check, eventually, finish, launch } from '../lib/harness.mjs';
import { writeFileSync } from 'node:fs';
import { out } from '../lib/harness.mjs';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Local mocked fixtures only');
const browser = await launch(),
  page = await (await browser.newContext()).newPage();
let mode = 'success',
  requests = [],
  release;
const consoleEvents = [],
  pageErrors = [];
page.on('console', (message) => {
  if (['warning', 'error'].includes(message.type()))
    consoleEvents.push({ type: message.type(), text: message.text(), url: message.location().url });
});
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.route('**/api/v1/public/site/submissions', async (route) => {
  requests.push(route.request().postDataJSON());
  if (mode === 'delay') await new Promise((resolve) => (release = resolve));
  await route.fulfill({ status: mode === 'error' ? 503 : 201, contentType: 'application/json', body: '{}' });
});
const visibleBelowHeader = async (locator) => {
  await locator.waitFor();
  return eventually(async () => {
    const box = await locator.boundingBox();
    const header = await page.locator('.marketing-header').boundingBox();
    return box.y >= header.y + header.height && box.y + box.height <= 900;
  });
};
try {
  for (const width of [1440, 375])
    for (const path of ['contact', 'demo-request', 'collaborate']) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + '/' + path);
      const form = page.locator('form.marketing-lead-form'),
        submit = form.locator('button[type=submit]'),
        name = form.locator('[name=fullName]'),
        email = form.locator('[name=email]');
      const start = requests.length;
      await submit.focus();
      await page.keyboard.press('Enter');
      check(
        (await visibleBelowHeader(name)) && (await name.evaluate((el) => el === document.activeElement)),
        width + ' ' + path + ': blank name focus clears sticky header',
      );
      check(
        (await name.getAttribute('aria-invalid')) === 'true' && (await name.getAttribute('aria-describedby')),
        'name error associated',
      );
      check(
        (await visibleBelowHeader(form.getByText('نام و نام خانوادگی', { exact: true }))) &&
          (await visibleBelowHeader(form.getByText('نام و نام خانوادگی را وارد کنید.', { exact: true }))),
        'name label and inline error also clear the header',
      );
      await name.fill('آزمون مصنوعی محلی');
      await email.fill('not-an-email');
      await submit.press('Enter');
      check(
        (await visibleBelowHeader(email)) && (await email.evaluate((el) => el === document.activeElement)),
        'invalid email focused below header',
      );
      check(requests.length === start, 'invalid inputs never submit');
      // Complete the form with keyboard-only traversal from the first field.
      await name.focus();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('Synthetic focus QA');
      await page.keyboard.press('Tab');
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('qa-focus@example.test');
      await page.keyboard.press('Tab'); // optional phone
      await page.keyboard.press('Tab');
      await page.keyboard.type('Synthetic organization or subject');
      if (path === 'demo-request') {
        await page.keyboard.press('Tab');
        await page.keyboard.press('ArrowDown');
      }
      await page.keyboard.press('Tab');
      await page.keyboard.type('Synthetic local form feedback verification.');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      mode = 'error';
      await page.keyboard.press('Enter');
      const failure = form.locator('.marketing-form-error[tabindex="-1"]');
      check(
        (await visibleBelowHeader(failure)) &&
          (await failure.evaluate((el) => el === document.activeElement)),
        'recoverable error visible and focused',
      );
      check((await name.inputValue()) === 'Synthetic focus QA', 'failed request preserves entered values');
      const failed = requests.at(-1);
      mode = 'delay';
      await submit.press('Enter');
      await page.waitForFunction(() => document.querySelector('form button[type=submit]').disabled);
      await submit.evaluate((el) => el.click());
      await form.evaluate((el) => el.requestSubmit());
      check(requests.length === start + 2, 'one request per intentional attempt while pending');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      release();
      const heading = page.locator('.marketing-form-success h3');
      check(
        (await visibleBelowHeader(heading)) &&
          (await heading.evaluate((el) => el === document.activeElement)),
        'success visible and focused even after pending scroll',
      );
      check(
        (await page.locator('.marketing-form-success[role="status"]').count()) === 0,
        'success uses focus instead of duplicate live-region announcement',
      );
      check(JSON.stringify(failed) === JSON.stringify(requests.at(-1)), 'retry preserves submit payload');
      await page.getByRole('button', { name: 'ارسال درخواست دیگر', exact: true }).press('Enter');
      check(
        (await visibleBelowHeader(name)) &&
          (await name.inputValue()) === '' &&
          (await name.evaluate((el) => el === document.activeElement)),
        'send another restores empty form and first focus',
      );
      check(
        requests.at(-1).website === '' && requests.at(-1).consent === true,
        'honeypot and consent contract preserved',
      );
    }
  check(pageErrors.length === 0, 'no uncaught browser errors');
  const unexpected = consoleEvents.filter(
    (event) =>
      !(
        event.type === 'error' &&
        event.url.includes('/api/v1/public/site/submissions') &&
        event.text.includes('503')
      ),
  );
  check(unexpected.length === 0, 'no unexpected console errors or warnings');
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  writeFileSync(out + '/lead-focus-console.json', JSON.stringify({ consoleEvents, pageErrors }, null, 2));
  await finish(browser);
}
