import { base, check, eventually, finish, launch, watchConsole } from '../lib/harness.mjs';
const browser = await launch();
const context = await browser.newContext({ colorScheme: 'dark' });
const page = await context.newPage();
watchConsole(page);
try {
  await page.goto(base + '/tasks');
  await page
    .getByRole('navigation', { name: 'ناوبری اصلی', exact: true })
    .getByRole('button', { name: 'تنظیم نمایش' })
    .click();
  const picker = page.getByRole('dialog', { name: 'انتخاب پوسته' });
  check((await picker.getByRole('radio').count()) === 3, 'only three appearance modes, no palette selector');
  for (const [theme, label] of [
    ['light', 'روشن'],
    ['dark', 'تیره'],
    ['system', 'سیستم'],
  ]) {
    await picker.getByRole('radio', { name: label, exact: true }).click();
    check(
      await eventually(
        async () =>
          (await page.locator('html').getAttribute('data-theme')) === (theme === 'system' ? 'dark' : theme),
      ),
      theme + ' resolves correctly',
    );
    check(
      await page
        .evaluate(() => JSON.parse(localStorage.getItem('taskin.theme')))
        .then((v) => Object.keys(v).length === 1 && v.theme === theme),
      'stores only theme',
    );
  }
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'networkidle' });
  check((await page.locator('html').getAttribute('data-accent')) === null, 'no injected accent attribute');
  check(
    (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(0, 0, 0)',
    'OLED canvas',
  );
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  await finish(browser);
}
