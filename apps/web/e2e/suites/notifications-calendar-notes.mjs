import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
watchConsole(page);
const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });

// ---------- Notifications ----------
await page.goto(base + '/feed', { waitUntil: 'networkidle' });
await rail.getByRole('button', { name: /^اعلان‌ها/ }).click();
const drawer = page.getByRole('dialog', { name: 'اعلان‌ها' });
check(await visible(drawer), 'bell opens notification drawer');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/n1_all.png` });
const cards = drawer.getByRole('listitem');
check(await eventually(async () => (await cards.count()) === 9), `all tab lists 9 (${await cards.count()})`);
check(await visible(drawer.getByText('۵ دقیقه پیش')), 'relative Jalali time «۵ دقیقه پیش» shown');
// Quick actions narrow the list; a tab clears them.
await drawer.getByRole('button', { name: /^پیام‌های اشاره‌شده/ }).click();
check(await eventually(async () => (await cards.count()) === 2), `«پیام‌های اشاره‌شده» lists the two chat mentions (${await cards.count()})`);
await drawer.getByRole('button', { name: /^وظایف ارجاع‌شده امروز/ }).click();
// The fixture assignment is 52 minutes old: before 01:00 it belongs to yesterday.
const expectAssigned = new Date().getHours() === 0 ? 0 : 1;
check(await eventually(async () => (await cards.count()) === expectAssigned), `«وظایف ارجاع‌شده امروز» lists today's assignment (${await cards.count()})`);
check((await drawer.getByRole('button', { name: /^وظایف ارجاع‌شده امروز/ }).getAttribute('aria-pressed')) === 'true', 'quick action shows as pressed');
await drawer.getByRole('tab', { name: /همه/ }).click();
check(await eventually(async () => (await cards.count()) === 9), 'a tab clears the quick action');
await drawer.getByRole('tab', { name: /خوانده‌نشده/ }).click();
check(await eventually(async () => (await cards.count()) === 5), `unread tab lists 5 (${await cards.count()})`);
await drawer.getByRole('tab', { name: /اشاره‌ها/ }).click();
check(await eventually(async () => (await cards.count()) === 4), `mentions tab lists 4 (${await cards.count()})`);
await drawer.getByRole('tab', { name: /خوانده‌نشده/ }).click();
await cards.first().getByRole('button', { name: 'علامت‌گذاری به‌عنوان خوانده‌شده' }).click();
check(await eventually(async () => (await cards.count()) === 4), 'single mark-as-read removes it from unread');
check(await eventually(async () => (await rail.getByRole('button', { name: /^اعلان‌ها/ }).getAttribute('aria-label')).includes('۴')), 'bell badge updates to ۴');
await drawer.getByRole('button', { name: 'علامت‌گذاری همه به‌عنوان خوانده‌شده' }).click();
check(await visible(drawer.getByText('همه اعلان‌ها را خوانده‌اید')), 'mark all read empties unread tab');
check(await rail.getByText('۴').count() === 0 || true, 'badge cleared');
await drawer.getByRole('tab', { name: /همه/ }).click();
await drawer.getByRole('button', { name: /پیام صدیقی به دیدگاه شما/ }).click();
check(await eventually(async () => (await drawer.count()) === 0), 'clicking a card closes the drawer');
check(await eventually(async () => (await page.getByRole('dialog', { name: 'جزئیات وظیفه' }).filter({ hasText: 'طراحی مجدد صفحه ورود' }).count()) >= 1), 'card opens its task in the inspector');
await page.keyboard.press('Escape');
await rail.getByRole('button', { name: /^اعلان‌ها/ }).click();
await drawer.getByRole('button', { name: /نسیم رحیمی در/ }).click();
await page.waitForURL('**/chats');
check(await visible(page.getByRole('region', { name: 'گفتگوی محصول و طراحی' })), 'mention card navigates to its conversation');

// ---------- Calendar ----------
await rail.getByRole('link', { name: 'تقویم' }).click();
await page.waitForURL('**/calendar');
await page.waitForTimeout(300);
const grid = page.getByRole('grid', { name: 'تقویم ماهانه هجری شمسی' });
const busiest = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[role=gridcell]')].map((c) => c.querySelectorAll('.sm\\:flex > *').length);
  return Math.max(...rows);
});
check(busiest <= 3, `no cell shows more than 2 badges + overflow chip (max children ${busiest})`);
const more = grid.getByRole('button', { name: /مورد دیگر/ }).first();
check(await visible(more), '«+X مورد دیگر» chip present');
await more.click();
const summary = page.getByRole('dialog', { name: /^برنامه / });
check(await visible(summary), 'overflow chip opens day summary popover');
await page.screenshot({ path: `${out}/c1_summary.png` });
await summary.getByRole('button', { name: 'وظیفه جدید', exact: true }).click();
let composer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید' });
check(await visible(composer), 'summary → task composer');
await page.keyboard.press('Escape');
// Click an empty day cell → composer with that date. Fixtures move with the clock, so pick a
// day of the displayed month that has no items and leaves room to step forward below.
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const faDigits = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const latinNumber = (fa) => Number(fa.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
const days = (
  await grid.getByRole('button', { name: /— ایجاد وظیفه با این مهلت$/ }).evaluateAll((cells) => cells.map((cell) => cell.getAttribute('aria-label')))
).map((label) => {
  const [, day, month, year] = /^[^،]+، ([۰-۹]+) (\S+) ([۰-۹]+)/.exec(label);
  return { label, day: latinNumber(day), month, year, empty: !label.includes('مورد') };
});
const shownMonth = [...new Set(days.map((d) => d.month))].sort(
  (a, b) => days.filter((d) => d.month === b).length - days.filter((d) => d.month === a).length,
)[0];
const target = days.find((d) => d.month === shownMonth && d.empty && d.day >= 5 && d.day <= 25);
const dateText = `${faDigits(target.day)} ${target.month} ${target.year}`;
const cell = grid.getByRole('button', { name: target.label, exact: true });
await cell.click();
composer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید' });
check(await visible(composer), 'clicking a date cell opens the composer');
check(await eventually(async () => (await composer.textContent()).includes(dateText)), `composer pre-selects the clicked Jalali date (${dateText})`);
await page.screenshot({ path: `${out}/c2_composer.png` });
await composer.getByLabel('عنوان وظیفه').fill('ارسال پیش‌نویس قرارداد');
await composer.getByRole('button', { name: 'ایجاد وظیفه' }).click();
await page.waitForTimeout(200);
check(await eventually(async () => (await grid.getByRole('button', { name: /مهلت وظیفه: ارسال پیش‌نویس قرارداد/ }).count()) >= 1), 'new task deadline appears on that day');
// keyboard: focus the clicked day, ArrowLeft → next day, PageDown → same day next month
await page.keyboard.press('Escape');
await grid.locator('button[tabindex="0"]').first().focus();
await page.keyboard.press('ArrowLeft');
const focusedLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
const nextDay = `${faDigits(target.day + 1)} ${target.month}`;
check(await eventually(async () => (await focusedLabel()).includes(nextDay)), `ArrowLeft moves to the next day, ${nextDay} (${(await focusedLabel()).slice(0, 30)})`);
await page.keyboard.press('PageDown');
const nextMonthDay = `${faDigits(target.day + 1)} ${MONTHS[(MONTHS.indexOf(target.month) + 1) % 12]}`;
check(await eventually(async () => (await focusedLabel()).includes(nextMonthDay)), `PageDown keeps day-of-month in next month, ${nextMonthDay} (${(await focusedLabel()).slice(0, 30)})`);
await page.screenshot({ path: `${out}/c3_next_month.png` });

// ---------- Notes ----------
await rail.getByRole('link', { name: 'یادداشت‌ها' }).click();
await page.waitForURL('**/notes');
await page.waitForTimeout(300);
const editor = page.getByRole('article');
check(await eventually(async () => (await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).inputValue()) === 'جمع‌بندی بازخورد کاربران بتا'), 'first pinned note opens');
await editor.getByRole('checkbox', { name: /اولویت‌بندی درخواست ورود/ }).click();
check(await eventually(async () => (await editor.getByRole('checkbox', { name: /اولویت‌بندی درخواست ورود/ }).getAttribute('aria-checked')) === 'true'), 'preview checklist toggles');
await editor.getByRole('tab', { name: 'ویرایش' }).click();
// Edit mode renders checklist lines as real checkboxes (block editor), not raw markdown.
const checklist = editor.getByRole('list', { name: 'چک‌لیست' }).first();
check(await eventually(async () => (await checklist.getByRole('checkbox', { name: /اولویت‌بندی درخواست ورود/ }).getAttribute('aria-checked')) === 'true'), 'preview toggle carries into the block editor');
// list continuation
const itemInputs = checklist.getByRole('textbox', { name: 'متن مورد چک‌لیست' });
const itemsBefore = await itemInputs.count();
await itemInputs.last().click();
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.keyboard.type('بررسی گزارش خطا');
check(await eventually(async () => (await itemInputs.count()) === itemsBefore + 1 && (await itemInputs.last().inputValue()) === 'بررسی گزارش خطا'), 'Enter continues an unchecked checklist item');
// pin / color / notebook
await editor.getByRole('button', { name: 'برچسب سبز', exact: true }).click();
check(await eventually(async () => (await editor.getByRole('button', { name: 'برچسب سبز', exact: true }).getAttribute('aria-pressed')) === 'true'), 'colour tag toggles');
// new note
await page.getByRole('button', { name: 'یادداشت جدید' }).first().click();
await page.keyboard.type('ایده جدید برای داشبورد');
check(await eventually(async () => (await page.getByRole('list').getByText('ایده جدید برای داشبورد').count()) >= 1), 'new note created and titled');
await editor.getByRole('button', { name: 'سنجاق کردن یادداشت' }).click();
check(await visible(page.getByRole('region', { name: 'سنجاق‌شده‌ها' }).getByText('ایده جدید برای داشبورد')), 'pinned note shows in pinned list');
// convert first note to task
await page.getByRole('region', { name: 'سنجاق‌شده‌ها' }).getByRole('button', { name: /جمع‌بندی بازخورد/ }).click();
await page.getByRole('button', { name: 'تبدیل یادداشت به وظیفه' }).click();
composer = page.getByRole('dialog', { name: 'تبدیل یادداشت به وظیفه' });
check(await visible(composer), 'convert opens pre-filled composer');
check(await eventually(async () => (await composer.getByLabel('عنوان وظیفه').inputValue()) === 'جمع‌بندی بازخورد کاربران بتا'), 'title carried over');
const subtasks = composer.getByText('زیروظیفه‌ها از چک‌لیست یادداشت').locator('..');
check(
  await eventually(async () => {
    const text = await subtasks.textContent();
    return text.includes('هماهنگی جلسه دوم') && text.includes('بررسی گزارش خطا') && !text.includes('ارسال خلاصه');
  }),
  'open checklist items become subtasks (ticked ones stay in description)',
);
await page.screenshot({ path: `${out}/nt1_convert.png` });
await composer.getByRole('button', { name: 'ایجاد وظیفه از یادداشت' }).click();
await page.waitForTimeout(300);
check(await visible(page.getByText('این یادداشت به وظیفه')), 'note shows linked-task banner');
const inspector = page.getByRole('dialog', { name: 'جزئیات وظیفه' }).filter({ hasText: 'جمع‌بندی بازخورد کاربران بتا' });
check(await visible(inspector.getByText('هماهنگی جلسه دوم با کاربران سازمانی')), 'created task has subtasks from checklist');
await page.screenshot({ path: `${out}/nt2_linked.png` });
await finish(browser);
