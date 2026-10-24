import { base, check, eventually, finish, launch, visible, watchConsole } from '../lib/harness.mjs';

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 375, height: 900 } })).newPage();
watchConsole(page);

async function openComposer() {
  if (page.viewportSize().width < 640) {
    await page.locator('header').first().getByRole('button', { name: 'ایجاد سریع', exact: true }).click();
    await page.getByRole('menuitem', { name: /^وظیفه جدید/ }).click();
  } else {
    await page.getByRole('button', { name: 'وظیفه جدید', exact: true }).click();
  }
}

async function contained(panel) {
  return panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth || rect.left < 0 || rect.right > root.clientWidth + 1
      || rect.top < 0 || rect.bottom > root.clientHeight + 1) return false;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
      const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
      const bounds = ancestor.getBoundingClientRect();
      if (clipsX && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || ancestor.scrollWidth > ancestor.clientWidth + 1)) return false;
      if (clipsY && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) return false;
    }
    return true;
  });
}

try {
  await page.goto(`${base}/tasks`, { waitUntil: 'networkidle' });
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openComposer();
    const composer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید', exact: true });
    check(await visible(composer), `${width}px: task form opens`);
    await composer.getByLabel('عنوان وظیفه', { exact: true }).fill('بررسی تقویم وظیفه');

    for (const label of ['انتخاب تاریخ شروع', 'انتخاب مهلت انجام']) {
      const trigger = composer.getByRole('button', { name: label, exact: true });
      check(await trigger.evaluate((element) => Math.abs(element.getBoundingClientRect().width - element.parentElement.getBoundingClientRect().width) <= 1), `${width}px: ${label} trigger fills its field`);
      await trigger.click();
      const panel = composer.getByRole('dialog', { name: label, exact: true });
      const grid = panel.getByRole('grid', { name: label, exact: true });
      check(await eventually(() => contained(panel)), `${width}px: ${label} fits viewport and modal without horizontal scrolling`);
      check(await grid.getByRole('gridcell').first().evaluate((element) => element.clientHeight >= 44 && element.getBoundingClientRect().width >= 43), `${width}px: calendar days remain readable touch targets`);

      const current = grid.locator('[data-date][tabindex="0"]');
      const previousDate = await current.getAttribute('data-date');
      await current.focus();
      await page.keyboard.press('ArrowLeft');
      const nextDate = new Date(previousDate);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      check(await eventually(() => grid.locator(`[data-date="${nextDate.toISOString().slice(0, 10)}"]`).evaluate((element) => document.activeElement === element && element.getAttribute('aria-selected') === 'true')), `${width}px: RTL arrow moves selection and keyboard focus together`);
      const month = await panel.locator('[aria-live="polite"]').textContent();
      await page.keyboard.press('PageDown');
      check(await eventually(async () => (await panel.locator('[aria-live="polite"]').textContent()) !== month && await grid.evaluate((element) => element.contains(document.activeElement))), `${width}px: PageDown changes month while keeping focus on a day`);
      await page.keyboard.press('Escape');
      check(await eventually(async () => !(await panel.isVisible()) && await composer.isVisible() && await trigger.evaluate((element) => element === document.activeElement)), `${width}px: Escape closes only calendar and returns focus to its trigger`);
    }
    await composer.getByRole('button', { name: 'انصراف', exact: true }).click();
  }

  // Reposition an already-open left-column calendar after viewport changes.
  await openComposer();
  const composer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید', exact: true });
  await composer.getByLabel('عنوان وظیفه', { exact: true }).fill('بررسی تغییر اندازه تقویم');
  await composer.getByRole('button', { name: 'انتخاب مهلت انجام', exact: true }).click();
  const panel = composer.getByRole('dialog', { name: 'انتخاب مهلت انجام', exact: true });
  await page.setViewportSize({ width: 375, height: 900 });
  check(await eventually(() => contained(panel)), 'open calendar repositions after desktop-to-mobile resize');
  await panel.getByRole('button', { name: 'امروز', exact: true }).click();
  check(await eventually(async () => !(await panel.isVisible()) && await composer.isVisible()), 'selecting today applies a date and keeps task form open');
} catch (error) {
  check(false, `calendar flow stopped: ${error.message}`);
} finally {
  await finish(browser);
}
