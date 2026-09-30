import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

// Phase 3.1 in the demo: flat projects, a new project's own chat channel, the owner's project
// trash with «بازیابی», and a removed member whose messages stay under their name.
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
watchConsole(page);
const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });
const tree = page.getByRole('navigation', { name: 'درخت پروژه‌ها' });
const board = page.getByRole('application', { name: 'بورد کانبان وظایف' });
const switcher = rail.getByRole('button', { name: /^فضای کاری فعال/ });
const switchTo = async (name) => {
  await switcher.click();
  await page.getByRole('menuitem', { name }).click();
  await eventually(async () => (await switcher.textContent()).includes(name.source ?? name));
};

/* ---------- 1. Flat projects ---------- */

await page.goto(base + '/tasks', { waitUntil: 'networkidle' });
check(await eventually(async () => (await tree.getByRole('button', { name: /نسخه وب/ }).count()) === 1), 'the project tree lists every project');
check((await tree.locator('[aria-expanded]').count()) === 0, 'no project nests others: nothing to expand or collapse');
await tree.getByRole('button', { name: /بازطراحی سامانه مشتریان/ }).click();
check(await eventually(async () => (await board.getByRole('group', { name: /رفع آسیب‌پذیری/ }).count()) === 0), 'a project’s board holds its own cards only (not a former sub-project’s)');
await tree.getByRole('button', { name: /نسخه وب/ }).click();
check(await eventually(async () => (await board.getByRole('group', { name: /رفع آسیب‌پذیری/ }).count()) === 1), '«نسخه وب» is a project of its own, with its cards');

// Only the workspace owner deletes projects: here (an admin) there is no delete and no trash.
check((await tree.getByRole('button', { name: /^حذف پروژه/ }).count()) === 0 && (await page.getByRole('button', { name: 'آرشیو / سطل زباله' }).count()) === 0, 'an admin sees no project delete and no trash');

/* ---------- 2. A new project opens its own channel ---------- */

await rail.getByRole('button', { name: 'ایجاد سریع' }).click();
await page.getByRole('menuitem', { name: 'پروژه جدید' }).click();
const composer = page.getByRole('dialog', { name: 'پروژه جدید' });
await composer.getByLabel('نام پروژه').fill('پروژه همگام');
await composer.getByRole('button', { name: 'ایجاد پروژه' }).click();
check(await eventually(async () => (await tree.getByRole('button', { name: /پروژه همگام/ }).count()) === 1), 'the project is created');
await rail.getByRole('link', { name: 'گفتگوها' }).click();
await page.waitForURL('**/chats');
const channelEntry = page.getByRole('button', { name: /پروژه همگام/ }).first();
check(await visible(channelEntry), 'its chat channel appears in the conversation list');
await channelEntry.click();
const channel = page.getByRole('region', { name: 'گفتگوی پروژه همگام' });
check(await visible(channel), 'the channel opens');
await channel.getByRole('button', { name: /نمایش جزئیات گفتگو/ }).click();
check(await visible(page.getByText('همان اعضای پروژه')), 'its members are the project’s: no «افزودن عضو» here');
await page.keyboard.press('Escape');

/* ---------- 3. The owner's trash ---------- */

await switchTo(/پارس‌داده/);
await rail.getByRole('link', { name: 'پروژه‌ها و وظایف' }).click();
await page.waitForURL('**/tasks');
const row = tree.getByRole('button', { name: /کمپین نوروزی/ }).first();
await row.hover();
await tree.getByRole('button', { name: 'حذف پروژه کمپین نوروزی' }).click();
const confirm = page.getByRole('dialog', { name: 'حذف پروژه «کمپین نوروزی»' });
check(await visible(confirm), 'deleting asks first, naming the 40 days of the trash');
check(await visible(confirm.getByText(/۴۰ روز/).first()), '…the 40 days are spelled out');
await confirm.getByRole('button', { name: 'انتقال به سطل زباله' }).click();
check(await eventually(async () => (await tree.getByRole('button', { name: /کمپین نوروزی/ }).count()) === 0), 'the project leaves the tree at once');
await page.getByRole('button', { name: 'آرشیو / سطل زباله' }).click();
const trash = page.getByRole('dialog', { name: 'آرشیو / سطل زباله' });
const trashed = trash.getByRole('list', { name: 'پروژه‌های حذف‌شده' }).getByRole('listitem').filter({ hasText: 'کمپین نوروزی' });
check(await visible(trashed), 'the trash lists it');
check(await visible(trashed.getByText('۴۰ روز تا پاک‌سازی')), 'with the days left before the purge');
await page.screenshot({ path: `${out}/p31_trash.png` });
await trashed.getByRole('button', { name: 'بازیابی کمپین نوروزی' }).click();
check(await eventually(async () => (await trashed.count()) === 0), '«بازیابی» takes it out of the trash');
check(await visible(trash.getByText('سطل زباله خالی است')), 'the trash is empty again');
await page.keyboard.press('Escape');
check(await eventually(async () => (await tree.getByRole('button', { name: /^کمپین نوروزی/ }).count()) === 1), 'the project is back in the tree');

/* ---------- 4. A removed member keeps their history ---------- */

await rail.getByRole('link', { name: 'اعضای سازمان' }).click();
await page.waitForURL('**/directory');
await page.getByRole('button', { name: 'حذف آرش کاویانی از فضای کاری' }).click();
const remove = page.getByRole('dialog', { name: 'حذف آرش کاویانی از فضای کاری' });
check(await visible(remove.getByText(/عضو سابق/)), 'removing explains that their work stays, as a former member');
await remove.getByRole('button', { name: 'حذف از فضای کاری' }).click();
check(await eventually(async () => (await page.getByRole('listitem').filter({ hasText: 'آرش کاویانی' }).count()) === 0), 'they leave the directory');

await switchTo(/راهنما/);
await rail.getByRole('link', { name: 'گفتگوها' }).click();
await page.waitForURL('**/chats');
await page.getByRole('button', { name: /محصول و طراحی/ }).first().click();
const product = page.getByRole('region', { name: 'گفتگوی محصول و طراحی' });
const arashMessage = product.locator('div.group\\/message').filter({ hasText: 'آرش کاویانی' }).first();
check(await visible(arashMessage), 'their messages stay in the thread, under their name');
check(await visible(arashMessage.getByText('عضو سابق')), '…marked «عضو سابق»');
await page.screenshot({ path: `${out}/p31_former.png` });

await finish(browser);
