import { check, eventually, visible } from '../lib/harness.mjs';

const workspaceButton = (page) => page.getByRole('navigation', { name: 'ناوبری اصلی' })
  .getByRole('button', { name: /^فضای کاری فعال/ });

async function workspaceSettings(page) {
  await workspaceButton(page).click();
  await page.getByRole('menuitem', { name: 'تنظیمات فضای کاری' }).click();
  return page.getByRole('dialog', { name: 'تنظیمات فضای کاری' });
}

const methodPath = (method, path) => (response) =>
  response.request().method() === method && path.test(new URL(response.url()).pathname);
const workspaceUpdate = methodPath('PATCH', /^\/api\/v1\/workspaces\/[^/]+$/);
const passwordUpdate = methodPath('POST', /^\/api\/v1\/auth\/password$/);

/** The owner edits the logo; the invited, freshly authenticated member sets and rotates a password. */
export async function verifySettings(owner, guest, png) {
  let dialog = await workspaceSettings(owner);
  const ticket = owner.waitForResponse(methodPath('POST', /^\/api\/v1\/uploads\/workspace-icon$/));
  const update = owner.waitForResponse(workspaceUpdate);
  await dialog.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  const saved = await update;
  check((await ticket).ok() && saved.ok(), 'settings upload requests a ticket and claims the uploaded icon');
  const logo = workspaceButton(owner).locator('img');
  check(await eventually(async () => await logo.count() === 1 && await logo.evaluate((image) => image.complete && image.naturalWidth > 0), 15_000), 'the active workspace updates to the uploaded logo');
  check(Boolean((await saved.json()).iconUrl), 'the workspace API returns the canonical stored logo URL');

  const removal = owner.waitForResponse(workspaceUpdate);
  await dialog.getByRole('button', { name: 'حذف تصویر' }).click();
  check((await removal).ok() && await eventually(() => workspaceButton(owner).locator('img').count().then((count) => count === 0)), 'the owner can remove the logo');
  await owner.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  dialog = await workspaceSettings(guest);
  check(await dialog.locator('input[type=file]').count() === 0, 'a member without workspace edit permission does not get logo controls');
  await guest.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await guest.getByRole('navigation', { name: 'ناوبری اصلی' }).getByRole('button', { name: /حساب کاربری/ }).click();
  await guest.getByRole('menuitem', { name: 'پروفایل من' }).click();
  await guest.getByRole('dialog', { name: 'پروفایل من' }).getByRole('button', { name: 'امنیت و ورود' }).click();
  const security = guest.getByRole('dialog', { name: 'امنیت و ورود' });
  const newPassword = security.getByLabel('رمز عبور جدید', { exact: true });
  const confirm = security.getByLabel('تکرار رمز عبور جدید', { exact: true });
  const current = security.getByLabel('رمز عبور فعلی', { exact: true });
  const savedPassword = security.getByRole('status').filter({ hasText: 'رمز عبور با موفقیت تغییر کرد.' });
  const first = 'TaskDoon-Settings-A!';
  const next = 'TaskDoon-Settings-B!';
  check(await current.count() === 0, 'the freshly invited account can set a first password without a current password');
  await newPassword.fill(first);
  await confirm.fill(first);
  const set = guest.waitForResponse(passwordUpdate);
  await security.getByRole('button', { name: 'ذخیره رمز مدیر' }).click();
  check((await set).status() === 204 && await visible(savedPassword) && await visible(current), 'password setup uses the real API and switches the form to rotation');
  await current.fill(first);
  await newPassword.fill(next);
  await confirm.fill(next);
  const change = guest.waitForResponse(passwordUpdate);
  await security.getByRole('button', { name: 'به‌روزرسانی رمز عبور' }).click();
  check((await change).status() === 204 && await visible(savedPassword), 'password rotation succeeds in the current session');
  await guest.keyboard.press('Escape');
  await security.waitFor({ state: 'hidden' });
}
