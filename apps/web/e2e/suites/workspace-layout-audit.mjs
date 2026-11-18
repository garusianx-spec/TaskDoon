import { base, check, eventually, finish, launch, visible, watchConsole } from '../lib/harness.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 375, height: 900 } })).newPage();
watchConsole(page);
try {
  await page.goto(base + '/tasks/mine');
  if ((await page.locator('html').getAttribute('data-source')) !== 'demo') throw Error('Synthetic demo only');
  const main = page.getByRole('main');
  check(
    await visible(main.getByRole('button', { name: 'وظیفه جدید', exact: true })),
    '375: Add task is visible in task results',
  );
  const checkbox = page.getByRole('checkbox').first();
  const cb = await checkbox.boundingBox();
  check(cb.width >= 44 && cb.height >= 44, '375: actual completion hit area is 44px');
  const visual = await checkbox.locator('span').boundingBox();
  check(visual.width === 16, 'checkbox visual remains 16px');
  const menu = await page
    .getByRole('button', { name: /تعویق یا ارجاع/ })
    .first()
    .boundingBox();
  check(menu.width >= 44 && menu.height >= 44, '375: task action hit area is 44px');
  await main.getByRole('button', { name: 'فیلترها', exact: true }).click();
  await page.getByRole('combobox', { name: 'فیلتر نوع وظیفه', exact: true }).click();
  await page.getByRole('option', { name: 'باگ', exact: true }).click();
  check(await visible(main.getByText('فیلترهای فعال')), 'selected filters have a visible indicator');
  await page.getByRole('button', { name: 'نمایش نتایج', exact: true }).click();
  check(
    (await main.getByRole('button', { name: 'فیلترها', exact: true }).getAttribute('aria-expanded')) ===
      'false',
    'explicit return closes filters',
  );
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    '375: RTL page has no horizontal overflow',
  );
  await page.goto(base + '/settings/roles');
  const tabs = page.getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowDown');
  check(
    await tabs.nth(1).evaluate((el) => el === document.activeElement),
    'role ArrowDown moves focus and selection',
  );
  await page.keyboard.press('End');
  check((await tabs.last().getAttribute('aria-selected')) === 'true', 'role End selects last role');
  const grid = page.getByRole('region', { name: /جدول دسترسی‌ها/ });
  await grid.focus();
  await page.keyboard.press('ArrowLeft');
  check(
    await grid.evaluate((el) => el.scrollWidth > el.clientWidth),
    'mobile permission grid exposes a keyboard scroll region',
  );
  const ratio = await tabs
    .first()
    .locator('span')
    .last()
    .evaluate((el) => {
      const rgb = getComputedStyle(el)
        .color.match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
      const values = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      const lum = values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      return 1.05 / (lum + 0.05);
    });
  console.log('Role permission-text contrast against white:', ratio);
  check(ratio >= 4.5, 'role permission-count text exceeds 4.5:1');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base + '/tasks');
  await page.getByRole('button', { name: 'نمایش ستون انجام شد', exact: true }).click();
  const done = page.getByRole('region', { name: 'ستون انجام شد', exact: true });
  check(
    await eventually(async () => {
      const b = await done.boundingBox();
      return b.x >= 0 && b.x + b.width <= 1280;
    }),
    '1280: Done column can be explicitly revealed',
  );
  await page.getByRole('button', { name: 'جستجوی وظیفه', exact: true }).click();
  await page.getByRole('searchbox', { name: 'جستجوی وظیفه', exact: true }).fill('synthetic-no-match-7291');
  check(
    await visible(page.getByText('وظیفه‌ای مطابق فیلتر نیست').first()),
    'filtered columns explain no matches',
  );
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(base + '/notes');
  const box = await page.getByRole('article').boundingBox();
  console.log('1024 note editor width:', box.width);
  check(box.width >= 400, '1024: note editor has at least 400px width');
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(base + '/tasks/mine');
  await page
    .getByRole('button')
    .filter({ hasText: 'رفع ناسازگاری چیدمان راست‌به‌چپ در جدول گزارش‌ها' })
    .first()
    .click();
  await page.getByRole('button', { name: 'نمایش پیام در گفتگو', exact: true }).click();
  await page.waitForURL('**/chats');
  check(await visible(main), '768: exact-message navigation reveals chat pane');
  check(await visible(page.locator('[data-message-id="m-14"]')), '768: exact source message is visible');
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  await finish(browser);
}
