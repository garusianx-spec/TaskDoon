import { base, check, eventually, finish, launch, visible, watchConsole } from '../lib/harness.mjs';

// Only the in-memory demo workspace is used; never point this fixture at a live account.
const browser = await launch();
const page = await (await browser.newContext()).newPage();
watchConsole(page);
try {
  const details = page.getByRole('dialog', { name: 'جزئیات وظیفه' });
  await page.goto(base + '/notes');
  if ((await page.locator('html').getAttribute('data-source')) !== 'demo')
    throw new Error('Demo fixture required');
  await page.getByRole('button', { name: 'یادداشت جدید', exact: true }).first().click();
  const editor = page.getByRole('article');
  await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).fill('ممیزی تبدیل یکتا');
  await editor.getByRole('button', { name: 'تبدیل یادداشت به وظیفه', exact: true }).click();
  const conversion = page.getByRole('dialog', { name: 'تبدیل یادداشت به وظیفه', exact: true });
  check(await visible(conversion.getByText(/موارد تیک‌نخورده/)), 'conversion explains unchecked items');
  await conversion.getByRole('button', { name: 'ایجاد وظیفه از یادداشت', exact: true }).click();
  await details.waitFor();
  const code = await details.locator('.latin-inline').first().innerText();
  await page.keyboard.press('Escape');
  await editor.getByRole('button', { name: 'تبدیل یادداشت به وظیفه', exact: true }).click();
  check(!(await conversion.isVisible()), 'repeated conversion does not open a new creation form');
  check(
    await visible(page.getByRole('status').filter({ hasText: 'این یادداشت قبلاً' })),
    'repeated conversion explains the existing reference',
  );
  check(
    await visible(editor.getByRole('button', { name: code, exact: true })),
    'original task reference is retained',
  );
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  await finish(browser);
}
