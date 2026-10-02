import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

/*
 * Agile tracking on the demo workspace: issue types and severity, the type filter, estimates and
 * worklogs, dependencies (cycles refused, the blocked pill, the non-blocking Done warning) and the
 * backlog. Cards nobody touched must look exactly as before.
 */
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
watchConsole(page);
await page.goto(base + '/tasks', { waitUntil: 'networkidle' });

const board = page.getByRole('application', { name: 'بورد کانبان وظایف' });
const cards = board.locator('article[aria-roledescription="کارت وظیفه"]');
const card = (title) => board.getByRole('group', { name: title });
const dialog = page.getByRole('dialog', { name: 'جزئیات وظیفه' });
const openCard = async (title) => {
  await card(title).locator('h4').click();
  await visible(dialog);
};
const closeDialog = async () => {
  await page.keyboard.press('Escape');
  await eventually(async () => (await dialog.count()) === 0);
};
const pick = async (scope, combobox, option) => {
  await scope.getByRole('combobox', { name: combobox, exact: true }).click();
  await page.getByRole('option', { name: option }).first().click();
};

// 0. Nothing changes for existing work: no type glyphs, no blocked pills, and a fourth view tab.
const untouched = card(/تهیه صورت/);
const untouchedBefore = await untouched.evaluate((element) => element.outerHTML);
const initialCards = await cards.count();
check((await board.getByRole('img', { name: /^(باگ|ویژگی)/ }).count()) === 0, 'no bug or feature glyphs on existing cards');
check((await board.getByText('مسدود', { exact: true }).count()) === 0, 'no blocked pills on existing cards');
check((await page.getByRole('tab', { name: 'بک‌لاگ' }).count()) === 1, 'view switcher offers «بک‌لاگ»');

// 1. A bug with a severity, from the composer.
await page.getByRole('button', { name: 'وظیفه جدید', exact: true }).click();
const composer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید' });
await visible(composer);
await composer.getByLabel('عنوان وظیفه').fill('خطای ورود با رمز عبور');
check((await composer.getByRole('combobox', { name: 'شدت', exact: true }).count()) === 0, 'severity is offered for bugs only');
await pick(composer, 'نوع', 'باگ');
await pick(composer, 'شدت', 'بحرانی');
await composer.getByRole('button', { name: 'ایجاد وظیفه' }).click();
await visible(dialog);
check(
  await eventually(async () => (await dialog.getByRole('combobox', { name: 'نوع وظیفه', exact: true }).textContent()).includes('باگ')),
  'the new task is a bug',
);
check((await dialog.getByRole('combobox', { name: 'شدت باگ', exact: true }).textContent()).includes('بحرانی'), '…with its severity');
await closeDialog();
check(await eventually(async () => (await card(/خطای ورود با رمز عبور/).getByRole('img', { name: /باگ.*بحرانی/ }).count()) === 1), 'the bug card shows the bug glyph');
check((await cards.count()) === initialCards + 1, 'the bug is on the board');

// 2. The type filter narrows the board and restores it.
await pick(page, 'فیلتر نوع وظیفه', 'باگ');
check(await eventually(async () => (await cards.count()) === 1), 'filter «باگ» leaves the one bug');
await pick(page, 'فیلتر نوع وظیفه', 'ویژگی');
check(await eventually(async () => (await cards.count()) === 0), 'filter «ویژگی» leaves none');
await pick(page, 'فیلتر نوع وظیفه', 'همه نوع‌ها');
check(await eventually(async () => (await cards.count()) === initialCards + 1), 'filter «همه نوع‌ها» restores the board');

// 3. Type change in the dialog: a feature, and the bug's severity goes.
await openCard(/خطای ورود با رمز عبور/);
await pick(dialog, 'نوع وظیفه', 'ویژگی');
check(await eventually(async () => (await dialog.getByRole('combobox', { name: 'شدت باگ', exact: true }).count()) === 0), 'a feature has no severity');
await closeDialog();
check(await eventually(async () => (await card(/خطای ورود با رمز عبور/).getByRole('img', { name: 'ویژگی' }).count()) === 1), 'the card now shows the feature glyph');

// 4. Estimate and time logging.
await openCard(/تهیه سند معماری/);
const estimate = dialog.getByLabel('برآورد زمان وظیفه');
await estimate.fill('2h');
await estimate.press('Enter');
check(await eventually(async () => (await estimate.inputValue()) === '۲ ساعت'), 'estimate «2h» reads «۲ ساعت»');
const timing = dialog.getByRole('region', { name: 'زمان‌سنجی وظیفه' });
check((await timing.textContent()).includes('صرف‌شده: ۰ دقیقه'), 'nothing spent yet');

await timing.getByRole('button', { name: 'ثبت زمان' }).click();
const worklog = page.getByRole('dialog', { name: 'ثبت زمان کار' });
await visible(worklog);
await worklog.getByLabel('مدت کار').fill('abc');
await worklog.getByLabel('یادداشت کار').click();
check(await visible(worklog.getByText(/مدت را مثلاً/)), 'an unreadable duration is refused');
await worklog.getByLabel('مدت کار').fill('1h 30m');
check(await visible(worklog.getByText('= ۱ ساعت و ۳۰ دقیقه')), '«1h 30m» reads as one hour thirty');
await worklog.getByLabel('یادداشت کار').fill('بررسی سناریوهای آفلاین');
await worklog.getByRole('button', { name: 'ثبت', exact: true }).click();
check(await eventually(async () => (await worklog.count()) === 0), 'the worklog dialog closes');
check(await eventually(async () => (await timing.textContent()).includes('صرف‌شده: ۱ ساعت و ۳۰ دقیقه')), 'spent time adds up');
check((await timing.textContent()).includes('۳۰ دقیقه باقی‌مانده'), 'remaining time against the estimate');
check((await timing.getByRole('progressbar', { name: 'زمان صرف‌شده نسبت به برآورد' }).getAttribute('aria-valuenow')) === '90', 'progress bar at 90 of 120');
check(await visible(timing.getByText('بررسی سناریوهای آفلاین')), 'the note is listed');

// Escape closes the worklog dialog only.
await timing.getByRole('button', { name: 'ثبت زمان' }).click();
await visible(worklog);
await page.keyboard.press('Escape');
check(await eventually(async () => (await worklog.count()) === 0 && (await dialog.count()) === 1), 'Escape closes the worklog dialog, not the task');
await timing.getByRole('button', { name: 'ثبت زمان' }).click();
await worklog.getByLabel('مدت کار').fill('۴۵');
await worklog.getByRole('button', { name: 'ثبت', exact: true }).click();
check(await eventually(async () => (await timing.textContent()).includes('۱۵ دقیقه بیش از برآورد')), 'going over the estimate is flagged');
await page.screenshot({ path: `${out}/agile_time.png` });
await closeDialog();

// 5. Dependencies: links, a refused cycle, the blocked pill and the Done warning.
const link = async (kind, taskCode) => {
  const deps = dialog.getByRole('region', { name: 'وابستگی‌های وظیفه' });
  await deps.getByRole('button', { name: 'افزودن وابستگی' }).click();
  await pick(deps, 'نوع رابطه', kind);
  await pick(deps, 'وظیفه پیوندی', taskCode);
  await deps.getByRole('button', { name: 'پیوند', exact: true }).click();
  return deps;
};
await openCard(/افزودن نمای گانت شمسی/);
let deps = await link('مسدود شده توسط', /SEC-301/);
check(await eventually(async () => (await deps.textContent()).includes('SEC-301') && (await deps.getByText('مسدود', { exact: true }).count()) === 1), 'CRM-109 is blocked by SEC-301');
await closeDialog();
await openCard(/رفع آسیب/);
deps = await link('مسدود شده توسط', /CRM-101/);
check(await eventually(async () => (await deps.textContent()).includes('CRM-101')), 'SEC-301 is blocked by CRM-101');
await closeDialog();
await openCard(/طراحی مجدد صفحه ورود/);
deps = await link('مسدود شده توسط', /CRM-109/);
check(await visible(deps.getByRole('alert').filter({ hasText: 'چرخه' })), 'a link closing CRM-101 → SEC-301 → CRM-109 → CRM-101 is refused');
await deps.getByRole('button', { name: 'انصراف' }).click();
await closeDialog();

check(await eventually(async () => (await card(/افزودن نمای گانت شمسی/).getByText('مسدود', { exact: true }).count()) === 1), 'blocked pill on CRM-109');
check((await card(/رفع آسیب/).getByText('مسدود', { exact: true }).count()) === 1, 'blocked pill on SEC-301');
check((await card(/طراحی مجدد صفحه ورود/).getByText('مسدود', { exact: true }).count()) === 0, 'no pill on the unblocked CRM-101');

// Completing a blocked task is allowed, with a warning.
await board.getByRole('checkbox', { name: /رفع آسیب/ }).click();
const notice = page.getByRole('status').filter({ hasText: 'هنوز منتظر' });
check(await visible(notice), 'the Done warning appears');
check((await notice.textContent()).includes('CRM-101'), '…naming the unfinished blocker');
const done = page.getByRole('region', { name: 'ستون انجام شد' });
check(await eventually(async () => (await done.getByRole('group', { name: /رفع آسیب/ }).count()) === 1), 'the move to Done still happened');
check(await eventually(async () => (await card(/افزودن نمای گانت شمسی/).getByText('مسدود', { exact: true }).count()) === 0), 'CRM-109 is unblocked once SEC-301 is done');
await page.screenshot({ path: `${out}/agile_notice.png` });
await notice.getByRole('button', { name: 'بستن هشدار' }).click();
check(await eventually(async () => (await notice.count()) === 0), 'the warning closes');

// Unlink.
await openCard(/افزودن نمای گانت شمسی/);
deps = dialog.getByRole('region', { name: 'وابستگی‌های وظیفه' });
await deps.getByRole('button', { name: 'حذف پیوند با SEC-301' }).click();
check(await visible(deps.getByText('این وظیفه به وظیفه دیگری وابسته نیست.')), 'the link is removed');
await closeDialog();

// 6. Backlog: out of the board, listed, and back.
await openCard(/رفع ناسازگاری چیدمان/);
await dialog.getByRole('button', { name: 'انتقال به بک‌لاگ' }).click();
check(await eventually(async () => (await dialog.getByRole('button', { name: 'انتقال به بورد' }).count()) === 1), 'the dialog offers the way back');
await closeDialog();
check(await eventually(async () => (await card(/رفع ناسازگاری چیدمان/).count()) === 0), 'a backlog item leaves the board');
await page.getByRole('tab', { name: 'بک‌لاگ' }).click();
const backlog = page.getByRole('region', { name: 'بک‌لاگ' });
check(await visible(backlog.getByText(/رفع ناسازگاری چیدمان/)), 'it is listed in the backlog');
check(await visible(page.getByText('۱ وظیفه در نمای فعلی')), 'the header counts the backlog');
await backlog.getByRole('button', { name: 'انتقال CRM-102 به بورد' }).click();
check(await visible(backlog.getByText('بک‌لاگ خالی است')), '«انتقال به بورد» empties the backlog');

await backlog.getByRole('button', { name: 'افزودن به بک‌لاگ' }).click();
await visible(composer);
check(await composer.getByRole('checkbox', { name: /افزودن به بک‌لاگ/ }).isChecked(), 'the composer starts in the backlog from there');
await composer.getByLabel('عنوان وظیفه').fill('ایده: خروجی اکسل گزارش‌ها');
await composer.getByRole('button', { name: 'ایجاد وظیفه' }).click();
await visible(dialog);
await closeDialog();
check(await visible(backlog.getByText('ایده: خروجی اکسل گزارش‌ها')), 'created straight into the backlog');
await page.screenshot({ path: `${out}/agile_backlog.png` });

await page.getByRole('tab', { name: 'بورد' }).click();
await visible(board);
check(await eventually(async () => (await card(/رفع ناسازگاری چیدمان/).count()) === 1), 'the moved item is back on the board');
check((await card(/ایده: خروجی اکسل گزارش‌ها/).count()) === 0, 'the new backlog item is not on the board');
// The board remounted (backlog tab): React ids and inline-style spacing are all a remount changes.
const settled = (html) => html.replace(/kanban-hint-[^"]+/g, 'kanban-hint').replace(/style="([^"]*)"/g, (_, css) => `style="${css.replace(/\s|;$/g, '')}"`);
check(settled(await untouched.evaluate((element) => element.outerHTML)) === settled(untouchedBefore), 'an untouched card renders exactly as before');

await finish(browser);
