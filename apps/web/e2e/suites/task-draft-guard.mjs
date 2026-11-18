import { base, check, eventually, finish, launch, visible, watchConsole } from '../lib/harness.mjs';

// Only the in-memory demo workspace is used; never point this fixture at a live account.
const browser = await launch();
const page = await (await browser.newContext()).newPage();
watchConsole(page);
try {
  await page.goto(base + '/tasks');
  if ((await page.locator('html').getAttribute('data-source')) !== 'demo')
    throw new Error('Demo fixture required');
  const create = () => page.getByRole('button', { name: 'وظیفه جدید', exact: true }).click();
  const composer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید' });
  const details = page.getByRole('dialog', { name: 'جزئیات وظیفه' });
  await create();
  await page.keyboard.press('Escape');
  check(!(await composer.isVisible()), 'untouched creation closes on Escape');
  await create();
  await composer.getByLabel('عنوان وظیفه', { exact: true }).fill('ممیزی مصنوعی پیش‌نویس');
  await page.keyboard.press('Escape');
  check(
    await visible(composer.getByText(/تغییرات ذخیره‌نشده دارید/)),
    'changed creation survives Escape with visible warning',
  );
  await composer.getByRole('button', { name: 'ادامه ویرایش' }).click();
  await composer.getByRole('button', { name: 'ایجاد وظیفه', exact: true }).click();
  await details.waitFor();
  const title = details.getByLabel('عنوان وظیفه', { exact: true });
  await title.fill('تغییر مصنوعی');
  await page.keyboard.press('Escape');
  check(await visible(details.getByText(/تغییرات ذخیره‌نشده دارید/)), 'changed task survives Escape');
  await page.mouse.click(2, 2);
  check(await details.isVisible(), 'backdrop dismiss also preserves the changed draft');
  check((await title.inputValue()) === 'تغییر مصنوعی', 'changed title remains available');
  await details.getByRole('button', { name: 'ادامه ویرایش' }).click();
  await details.getByRole('button', { name: 'بستن پنل جزئیات' }).click();
  check(await visible(details.getByText(/تغییرات ذخیره‌نشده دارید/)), 'close button uses the same guard');
  await details.getByRole('button', { name: 'ادامه ویرایش' }).click();
  await title.fill(' ');
  await details.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  check(await visible(details.getByText('عنوان وظیفه را وارد کنید.')), 'invalid title stays inline');
  await title.fill('ممیزی ذخیره‌شده');
  await details.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  check(await eventually(async () => !(await details.isVisible())), 'successful save closes guarded editor');
  check(
    await visible(page.getByRole('status').filter({ hasText: 'تغییرات وظیفه ذخیره شد.' })),
    'successful edit gives visible feedback',
  );
  await page
    .getByRole('group', { name: /ممیزی ذخیره‌شده/ })
    .locator('h4')
    .click();
  await title.fill('تغییر موقت');
  await title.fill('ممیزی ذخیره‌شده');
  await page.keyboard.press('Escape');
  check(!(await details.isVisible()), 'reverted task closes simply');
  await create();
  await composer.getByLabel('عنوان وظیفه', { exact: true }).fill('پیش‌نویس کنارگذاشته‌شده');
  await composer.getByRole('button', { name: 'انصراف', exact: true }).click();
  await composer.getByRole('button', { name: 'کنار گذاشتن تغییرات' }).click();
  check(!(await composer.isVisible()), 'explicit discard closes changed creation');
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  await finish(browser);
}
