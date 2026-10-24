import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
watchConsole(page);
try {
  await page.goto(`${base}/feed`);
  const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });
  const heading = rail.getByRole('heading', { name: 'منو', exact: true });
  check(await visible(heading), 'desktop navigation has a visible section heading');
  const navBox = await rail.boundingBox();
  const titleBox = await heading.boundingBox();
  check(titleBox.x >= navBox.x && titleBox.x + titleBox.width <= navBox.x + navBox.width, 'the heading fits the existing desktop rail');
  check(await rail.getByRole('list', { name: 'منو' }).getByRole('link').count() === 6, 'the heading labels all six module links accessibly');
  const openProfile = async () => {
    await rail.getByRole('button', { name: /حساب کاربری/ }).click();
    await page.getByRole('menuitem', { name: 'پروفایل من', exact: true }).click();
    await page.getByRole('dialog', { name: 'پروفایل من' }).waitFor();
  };
  await openProfile();
  let profile = page.getByRole('dialog', { name: 'پروفایل من' });
  let name = profile.getByRole('textbox', { name: 'نام نمایشی' });
  await name.fill('  ');
  await profile.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  check(await visible(profile) && await name.getAttribute('aria-invalid') === 'true', 'blank display names show validation and keep the profile open');
  await profile.getByRole('textbox', { name: 'پیام وضعیت' }).focus();
  await name.focus();
  check(await eventually(async () => await name.getAttribute('aria-invalid') !== 'true'), 'corrective focus clears the display-name error');
  await name.fill('  پرنیان آزمون  ');
  await name.press('Enter');
  check(await eventually(async () => await profile.count() === 0), 'keyboard save confirms the profile and closes the form');
  check(await visible(page.getByRole('status').filter({ hasText: 'پروفایل شما به‌روزرسانی شد.' })), 'profile save displays success feedback');
  check(await eventually(async () => (await rail.getByRole('button', { name: /حساب کاربری/ }).textContent()).includes('پرنیان آزمون')), 'the shared account header immediately shows the new name');
  check(await visible(page.getByRole('heading', { name: /سلام پرنیان،/ })), 'the home greeting immediately uses the edited display name');
  await rail.getByRole('link', { name: 'اعضای سازمان' }).click();
  check(await visible(page.locator('main').getByText('پرنیان آزمون', { exact: true })), 'the workspace directory immediately shows the new name');
  await openProfile();
  profile = page.getByRole('dialog', { name: 'پروفایل من' });
  name = profile.getByRole('textbox', { name: 'نام نمایشی' });
  check(await name.inputValue() === 'پرنیان آزمون', 'reopening profile retains the trimmed saved name');
  await name.fill('نام ذخیره‌نشده');
  await profile.getByRole('button', { name: 'انصراف' }).click();
  check((await rail.getByRole('button', { name: /حساب کاربری/ }).textContent()).includes('پرنیان آزمون'), 'Cancel preserves the confirmed display name');

  await rail.getByRole('link', { name: 'یادداشت‌ها' }).click();
  await page.waitForURL('**/notes');
  await page.getByRole('button', { name: 'یادداشت جدید', exact: true }).first().click();
  const editor = page.getByRole('article');
  await editor.getByRole('button', { name: 'ذخیره یادداشت', exact: true }).click();
  check(await visible(editor.getByRole('alert')), 'saving a blank note explains what to write');
  for (const category of ['شخصی', 'کاری', 'ایده‌ها', 'صورت‌جلسه‌ها']) {
    await editor.getByRole('combobox', { name: 'دسته', exact: true }).click();
    await page.getByRole('option', { name: category, exact: true }).click();
    check(await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).inputValue() === '', `${category}: category can be selected before writing`);
    await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).fill(`یادداشت مرحله سوم ${category}`);
    await editor.getByRole('textbox', { name: 'متن یادداشت', exact: true }).fill(`متن ذخیره‌شده در ${category}`);
    await editor.getByRole('button', { name: 'ذخیره یادداشت', exact: true }).click();
    check(await eventually(async () => await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).inputValue() === '' && await editor.getByRole('textbox', { name: 'متن یادداشت', exact: true }).inputValue() === ''), `${category}: Save resets both title and body for a fresh note`);
    check(await editor.getByRole('combobox', { name: 'دسته', exact: true }).textContent() === category && await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).evaluate(node => node === document.activeElement), `${category}: the fresh editor keeps its category and focuses the title`);
  }
  check(await visible(page.getByRole('status').filter({ hasText: 'یادداشت ذخیره شد.' })), 'note save gives visible success feedback');
  await page.getByRole('region', { name: 'فهرست همه یادداشت‌ها' }).getByRole('button').filter({ hasText: 'یادداشت مرحله سوم ایده‌ها' }).click();
  check(await editor.getByRole('combobox', { name: 'دسته', exact: true }).textContent() === 'ایده‌ها', 'reopening the saved note retains its selected category');
  check(await visible(editor.getByText('متن ذخیره‌شده در ایده‌ها')), 'reopening retains the saved note content');
  await page.screenshot({ path: `${out}/phase3_desktop_notes.png` });
  await page.setViewportSize({ width: 375, height: 812 });
  check(!await rail.isVisible(), 'the desktop navigation title stays hidden on phones');
  await editor.getByRole('button', { name: 'بازگشت به فهرست یادداشت‌ها' }).click();
  await page.getByRole('button', { name: 'یادداشت جدید', exact: true }).filter({ visible: true }).first().click();
  check(await visible(editor.getByRole('button', { name: 'ذخیره یادداشت', exact: true })), 'Save stays reachable on a 375px phone');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('article')].every(node => node.scrollWidth <= node.clientWidth)), 'the mobile note editor and actions have no horizontal overflow');
  await page.screenshot({ path: `${out}/phase3_mobile_notes.png` });
} catch (error) {
  check(false, `Phase 3 browser flow stopped: ${error.message}`);
} finally {
  await finish(browser);
}
