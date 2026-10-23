import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

// Exercise the actual modal and reducer together, including the project-owned board/channel.
// Database persistence and submitted IDs are covered by the corresponding live-flow checks.
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
watchConsole(page);
const dialog = page.getByRole('dialog', { name: 'پروژه جدید', exact: true });
const departmentPicker = page.getByRole('dialog', { name: 'انتخاب دپارتمان‌های پروژه', exact: true });
const memberPicker = page.getByRole('dialog', { name: 'انتخاب اعضای پروژه', exact: true });
const projectName = 'پروژه آزمون چندتیمی';
const customDepartment = 'پژوهش و نوآوری';
const departments = ['مهندسی و توسعه', 'محصول', 'طراحی تجربه کاربری', 'بازاریابی', 'مالی و اداری', 'عملیات و پشتیبانی'];
const colorLabels = ['سبزآبی', 'بنفش', 'کهربایی', 'صورتی', 'خاکستری'];

const open = async () => {
  await page.getByRole('navigation', { name: 'ناوبری اصلی' }).getByRole('button', { name: 'ایجاد سریع' }).click();
  await page.getByRole('menuitem', { name: 'پروژه جدید', exact: true }).click();
  await dialog.waitFor();
};
const dismissPicker = async (picker, label) => {
  await page.keyboard.press('Escape');
  check(await eventually(async () => (await picker.count()) === 0) && await dialog.isVisible(), `${label}: Escape closes the picker and preserves the project draft`);
};
const fitsViewport = (locator) => locator.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1
    && element.scrollWidth <= element.clientWidth + 1;
});

try {
  await page.goto(base + '/tasks', { waitUntil: 'networkidle' });
  await open();
  check((await dialog.getByRole('textbox', { name: 'توضیحات (اختیاری)', exact: true }).count()) === 0
    && (await dialog.locator('textarea').count()) === 0, 'project creation has no optional description textarea');
  await dialog.getByRole('button', { name: 'ایجاد پروژه', exact: true }).click();
  check(await visible(dialog.getByText('نام پروژه را وارد کنید.', { exact: true })), 'an empty project name is rejected without discarding the draft');
  await dialog.getByRole('textbox', { name: 'نام پروژه', exact: true }).fill(projectName);
  await dialog.getByRole('textbox', { name: 'کلید پروژه', exact: true }).fill('PJT2');

  await dialog.getByRole('button', { name: 'دپارتمان‌های پروژه', exact: true }).click();
  check(await visible(departmentPicker), 'departments open as a labelled multiselect');
  check((await departmentPicker.getByRole('checkbox', { name: 'محصول', exact: true }).getAttribute('aria-checked')) === 'true', 'the product department starts selected');
  const iconSignatures = await Promise.all(departments.map(async (name) => {
    const checkbox = departmentPicker.getByRole('checkbox', { name, exact: true });
    return checkbox.locator('..').locator('svg').last().evaluate((icon) => icon.innerHTML);
  }));
  check(iconSignatures.every(Boolean) && new Set(iconSignatures).size === departments.length, 'each default department has a distinct contextual icon');
  await departmentPicker.getByRole('checkbox', { name: 'مهندسی و توسعه', exact: true }).click();
  await departmentPicker.getByRole('checkbox', { name: 'طراحی تجربه کاربری', exact: true }).click();
  check((await departmentPicker.getByRole('checkbox', { name: 'مهندسی و توسعه', exact: true }).getAttribute('aria-checked')) === 'true'
    && (await departmentPicker.getByRole('checkbox', { name: 'محصول', exact: true }).getAttribute('aria-checked')) === 'true'
    && (await departmentPicker.getByRole('checkbox', { name: 'طراحی تجربه کاربری', exact: true }).getAttribute('aria-checked')) === 'true', 'multiple departments remain selected together');
  const departmentSearch = departmentPicker.getByRole('textbox', { name: 'جستجو یا افزودن دپارتمان', exact: true });
  await departmentSearch.fill(customDepartment);
  await departmentPicker.getByRole('button', { name: `افزودن دپارتمان «${customDepartment}»`, exact: true }).click();
  check(await visible(dialog.getByRole('button', { name: `حذف دپارتمان ${customDepartment}`, exact: true })), 'a custom department is created inline and selected');
  check(await departmentSearch.evaluate(element => element === document.activeElement), 'adding a custom department returns focus to the search field');
  await dismissPicker(departmentPicker, 'new custom department');
  await dialog.getByRole('button', { name: 'دپارتمان‌های پروژه', exact: true }).click();
  await departmentSearch.fill(`  ${customDepartment}  `);
  check((await departmentPicker.getByRole('button', { name: /^افزودن دپارتمان/ }).count()) === 0, 'an existing normalized department name cannot be added twice');
  await dismissPicker(departmentPicker, 'departments');
  await dialog.getByRole('button', { name: 'حذف دپارتمان طراحی تجربه کاربری', exact: true }).click();
  check((await dialog.getByRole('button', { name: 'حذف دپارتمان طراحی تجربه کاربری', exact: true }).count()) === 0
    && await dialog.getByRole('button', { name: 'حذف دپارتمان مهندسی و توسعه', exact: true }).isVisible(), 'a department tag can be removed without clearing other selections');

  await dialog.getByRole('button', { name: 'اعضای پروژه', exact: true }).click();
  check(await visible(memberPicker.getByRole('textbox', { name: 'جستجوی اعضای سازمان', exact: true })), 'project members include an accessible search input');
  const creator = memberPicker.getByRole('checkbox', { name: 'سحر موسوی', exact: true });
  check(await creator.isDisabled() && (await creator.getAttribute('aria-checked')) === 'true', 'the project creator remains a selected member');
  const memberSearch = memberPicker.getByRole('textbox', { name: 'جستجوی اعضای سازمان', exact: true });
  await memberSearch.fill('کاویانی');
  check((await memberPicker.getByRole('checkbox').count()) === 1
    && await memberPicker.getByRole('checkbox', { name: 'آرش کاویانی', exact: true }).isVisible(), 'member search narrows the available users');
  check(await visible(memberPicker.locator('[data-project-member-avatar]')), 'search results show the member avatar');
  await memberPicker.getByRole('checkbox', { name: 'آرش کاویانی', exact: true }).click();
  await memberSearch.fill('نسیم');
  await memberPicker.getByRole('checkbox', { name: 'نسیم رحیمی', exact: true }).click();
  await dismissPicker(memberPicker, 'members');
  check(await visible(dialog.getByRole('button', { name: 'حذف عضو آرش کاویانی', exact: true }))
    && await visible(dialog.getByRole('button', { name: 'حذف عضو نسیم رحیمی', exact: true })), 'several selected members remain visible as removable badges');
  await dialog.getByRole('button', { name: 'حذف عضو نسیم رحیمی', exact: true }).click();
  check((await dialog.getByRole('button', { name: 'حذف عضو نسیم رحیمی', exact: true }).count()) === 0
    && await dialog.getByRole('button', { name: 'حذف عضو آرش کاویانی', exact: true }).isVisible(), 'removing a member badge preserves the other member');

  const color = dialog.getByRole('combobox', { name: 'رنگ پروژه', exact: true });
  const colors = async () => {
    await color.click();
    return Promise.all(colorLabels.map(async (name) => {
      const swatch = page.getByRole('option', { name, exact: true }).locator('[data-project-color]');
      return swatch.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const rgb = style.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
        return { background: style.backgroundColor, width: rect.width, height: rect.height,
          opaque: rgb.length === 3 || rgb[3] === 1, opacity: style.opacity,
          vivid: rgb.slice(0, 3).filter((channel) => channel < 220).length >= 2 };
      });
    }));
  };
  const lightColors = await colors();
  check(lightColors.every((swatch) => swatch.opaque && swatch.opacity === '1' && swatch.vivid && swatch.width >= 15 && swatch.height >= 15)
    && new Set(lightColors.map((swatch) => swatch.background)).size === colorLabels.length, 'all five color swatches render with distinct opaque vivid fills in the light theme');
  await page.getByRole('option', { name: 'بنفش', exact: true }).click();
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const darkColors = await colors();
  check(darkColors.every((swatch, index) => swatch.background === lightColors[index].background && swatch.opaque && swatch.width >= 15), 'the solid color palette stays visible and unchanged in the dark theme');
  await page.getByRole('option', { name: 'بنفش', exact: true }).click();
  await page.screenshot({ path: `${out}/project_creation_dark.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });

  await page.setViewportSize({ width: 375, height: 812 });
  check(await fitsViewport(dialog), 'the project modal fits a 375px viewport without horizontal scrolling');
  await dialog.getByRole('button', { name: 'دپارتمان‌های پروژه', exact: true }).click();
  check(await fitsViewport(departmentPicker), 'the department picker fits the mobile viewport');
  await dismissPicker(departmentPicker, 'mobile departments');
  await dialog.getByRole('button', { name: 'اعضای پروژه', exact: true }).click();
  check(await fitsViewport(memberPicker), 'the member picker fits the mobile viewport');
  await dismissPicker(memberPicker, 'mobile members');
  check((await dialog.getByRole('textbox', { name: 'نام پروژه', exact: true }).inputValue()) === projectName, 'responsive resizing and picker dismissal preserve the form draft');
  await page.screenshot({ path: `${out}/project_creation_mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole('button', { name: 'ایجاد پروژه', exact: true }).click();
  check(await eventually(async () => (await dialog.count()) === 0), 'the completed project form submits and closes');
  await page.waitForURL('**/tasks');
  const tree = page.getByRole('navigation', { name: 'درخت پروژه‌ها' });
  const project = tree.getByRole('button', { name: new RegExp(`^${projectName}`) });
  check(await eventually(async () => (await project.count()) === 1), 'the new project appears exactly once in the project list');
  if ((await project.getAttribute('aria-current')) !== 'true') await project.click();
  const board = page.getByRole('application', { name: 'بورد کانبان وظایف', exact: true });
  check(await eventually(async () => (await board.getByRole('region', { name: /^ستون / }).count()) === 4), 'project creation generates exactly four board columns');
  await page.getByRole('button', { name: 'وظیفه جدید', exact: true }).click();
  const taskComposer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید', exact: true });
  check((await taskComposer.getByRole('combobox', { name: 'پروژه', exact: true }).count()) === 0, 'the new board is ready for project-scoped task creation');
  await taskComposer.getByRole('textbox', { name: 'عنوان وظیفه', exact: true }).fill('وظیفه پروژه چندتیمی');
  await taskComposer.getByRole('button', { name: 'ایجاد وظیفه', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'جزئیات وظیفه', exact: true });
  check(await visible(details.getByText(projectName, { exact: true })), 'a task created on the generated board belongs to the new project');
  await page.keyboard.press('Escape');
  check(await visible(board.getByRole('group', { name: /وظیفه پروژه چندتیمی/ })), 'the generated board renders its first task correctly');
  await page.getByRole('navigation', { name: 'ناوبری اصلی' }).getByRole('link', { name: /^گفتگوها/ }).click();
  await page.waitForURL('**/chats');
  const companion = page.getByRole('complementary', { name: 'ستون زمینه', exact: true }).getByRole('button', { name: new RegExp(`^${projectName}`) });
  check(await eventually(async () => (await companion.count()) === 1), 'the project creates a single companion chat channel');
  await companion.click();
  check(await visible(page.getByRole('region', { name: `گفتگوی ${projectName}`, exact: true })), 'the companion channel opens normally');
  await page.screenshot({ path: `${out}/project_creation_channel.png` });
} catch (error) {
  check(false, `project creation stopped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  await page.screenshot({ path: `${out}/project_creation_failure.png` }).catch(() => undefined);
}

await finish(browser);
