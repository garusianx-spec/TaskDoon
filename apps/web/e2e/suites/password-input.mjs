import { base, check, finish, launch, watchConsole } from '../lib/harness.mjs';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local fixture only');
const browser = await launch();
try {
  for (const width of [375, 1440]) {
    const page = await (await browser.newContext({ viewport: { width, height: 1000 } })).newPage();
    watchConsole(page);
    await page.goto(base + '/more/account');
    if ((await page.locator('html').getAttribute('data-source')) !== 'demo') throw new Error('Demo required');
    await page.getByRole('button', { name: 'امنیت و ورود', exact: true }).click();
    await page.getByRole('dialog', { name: 'امنیت و ورود' }).waitFor();
    const input = page.getByLabel('رمز عبور جدید', { exact: true });
    const toggle = page.getByRole('button', { name: 'نمایش رمز عبور جدید', exact: true });
    await input.fill('Synthetic-only-123!');
    for (const dir of ['rtl', 'ltr']) {
      await page.locator('html').evaluate((el, dir) => (el.dir = dir), dir);
      const metrics = await input.evaluate((el) => {
        const eye = el.parentElement.querySelector('button');
        const r = el.getBoundingClientRect();
        const e = eye.getBoundingClientRect();
        return {
          ltr: getComputedStyle(el).direction === 'ltr',
          clear: r.right - parseFloat(getComputedStyle(el).paddingRight) <= e.left,
          right: e.left > r.left + r.width / 2,
          touch: e.width >= 44 && e.height >= 44,
        };
      });
      check(
        metrics.ltr && metrics.right && metrics.clear && metrics.touch,
        width + ' ' + dir + ': LTR input with clear right eye target',
      );
    }
    await input.focus();
    await toggle.click();
    check((await input.getAttribute('type')) === 'text', width + ': click reveals');
    check(await input.evaluate((el) => el === document.activeElement), width + ': mouse keeps input focus');
    await page.keyboard.press('Tab');
    check(
      await page
        .getByRole('button', { name: 'پنهان کردن رمز عبور جدید', exact: true })
        .evaluate((el) => el === document.activeElement),
      width + ': eye reachable by Tab',
    );
    await page.keyboard.press('Space');
    check((await input.getAttribute('type')) === 'password', width + ': Space hides');
    check((await input.inputValue()) === 'Synthetic-only-123!', width + ': value preserved');
    await page.close();
  }
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  await finish(browser);
}
