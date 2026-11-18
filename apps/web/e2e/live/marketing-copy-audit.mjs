import { base, check, eventually, finish, launch, watchConsole } from '../lib/harness.mjs';
const browser = await launch();
const page = await (await browser.newContext()).newPage();
watchConsole(page);
try {
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '/pricing');
    const region = page.getByRole('region', { name: 'جدول مقایسهٔ پلن‌ها', exact: true });
    await region.waitFor();
    await region.focus();
    check(
      await region.evaluate((el) => el === document.activeElement),
      width + ': comparison is keyboard focusable',
    );
    if (width < 540) {
      await page.keyboard.press('ArrowLeft');
      check(
        await eventually(async () => await region.evaluate((el) => el.scrollLeft < 0)),
        width + ': comparison scrolls with the keyboard',
      );
    }
    check(
      (await region.getByText('ذکر نشده', { exact: true }).count()) > 0,
      width + ': missing published detail has an explicit label',
    );
    const label = region.locator('th[scope="row"]').first();
    const before = await label.boundingBox();
    await region.evaluate((el) => (el.scrollLeft = -el.scrollWidth));
    const after = await label.boundingBox();
    check(
      Math.abs(before.x - after.x) < 2,
      width + ': RTL capability label stays visible during horizontal comparison',
    );
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      width + ': no page horizontal overflow',
    );
  }
  await page.goto(base + '/demo-request');
  const jump = page.getByRole('link', { name: 'رفتن به فرم درخواست دمو', exact: true });
  await jump.focus();
  await page.keyboard.press('Enter');
  check(
    await eventually(async () => new URL(page.url()).hash === '#demo-form'),
    'demo jump keeps the published form anchor',
  );
  await page.keyboard.press('Tab');
  check(
    await page
      .getByRole('textbox', { name: 'نام و نام خانوادگی', exact: true })
      .evaluate((el) => el === document.activeElement),
    'keyboard proceeds directly into the demo form',
  );
  // GET only: the fixture rejects submissions. No lead or consent is submitted.
  const help = await page.goto(base + '/help');
  check(help.status() === 200, 'existing Help destination resolves');
  check(
    await page.getByText('هنوز محتوایی در این بخش منتشر نشده است.').isVisible(),
    'Help accurately reflects the empty published collection',
  );
  const privacy = await page.request.get(base + '/privacy');
  await page.getByRole('link', { name: 'مشاهده پرسش‌های متداول', exact: true }).click();
  check(
    await eventually(async () => new URL(page.url()).pathname === '/faq'),
    'Help fallback opens the existing published FAQ',
  );
  check((await page.request.get(base + '/faq')).status() === 200, 'FAQ link destination returns success');
  check(privacy.status() === 404, 'unpublished privacy is not treated as an approved policy');
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  await finish(browser);
}
