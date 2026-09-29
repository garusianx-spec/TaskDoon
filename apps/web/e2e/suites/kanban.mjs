import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
watchConsole(page);
await page.goto(base + '/tasks', { waitUntil: 'networkidle' });
const projectTree = page.getByRole('navigation', { name: 'درخت پروژه‌ها' });
const openProject = (name) => projectTree.getByRole('button', { name }).first().click();
const board = page.getByRole('application', { name: 'بورد کانبان وظایف' });

// 0. «همه وظایف» groups every card by status: four status columns, nothing to add or edit.
check(
  await eventually(async () => (await board.locator('section[aria-label^="ستون "]').count()) === 4 && (await page.getByRole('button', { name: 'افزودن ستون جدید' }).count()) === 0),
  'all tasks: four status columns, no column editing',
);

// 1. Add a custom column: columns belong to a project, so on the mobile app's board.
await openProject(/اپلیکیشن موبایل/);
await page.getByRole('button', { name: 'افزودن ستون جدید' }).click();
await page.getByLabel('نام ستون').fill('تست کیفیت');
await page.getByRole('radio', { name: 'قرمز' }).click();
await page.getByRole('button', { name: 'افزودن ستون', exact: true }).click();
const qa = page.getByRole('region', { name: 'ستون تست کیفیت' });
check(await eventually(async () => (await qa.count()) === 1), 'custom column appended');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/k1_added.png` });

// duplicate name rejected
await page.getByRole('button', { name: 'افزودن ستون جدید' }).click();
await page.getByLabel('نام ستون').fill('تست کیفیت');
await page.getByRole('button', { name: 'افزودن ستون', exact: true }).click();
check(await visible(page.getByText('ستونی با این نام وجود دارد.')), 'duplicate column name rejected');
await page.keyboard.press('Escape');

// Another project's board never gets it.
await openProject(/نسخه وب/);
check(await eventually(async () => (await page.getByRole('region', { name: 'ستون برای انجام' }).count()) === 1 && (await qa.count()) === 0), 'the web project’s board does not get the column');
await openProject(/اپلیکیشن موبایل/);

// 2. Drag a todo card into the new column. Columns keep a fixed width, so the new column sits
// past the board's visible end: the board scrolls mid-drag, as the browser's edge auto-scroll would.
const card = page.getByRole('group', { name: /تهیه سند معماری همگام‌سازی آفلاین/ });
await card.hover();
await page.mouse.down();
const from = await card.boundingBox();
await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2, { steps: 4 }); // the drag starts
await qa.evaluate((column) => column.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' }));
const to = await qa.boundingBox();
await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
check(await eventually(async () => (await qa.getByRole('group', { name: /تهیه سند معماری/ }).count()) === 1), 'card dragged into custom column');

// 3. Quick-complete from the custom column → goes to Done, struck through
await qa.getByRole('checkbox', { name: /تهیه سند معماری/ }).click();
const done = page.getByRole('region', { name: 'ستون انجام شد' });
await page.waitForTimeout(200);
check(await eventually(async () => (await done.getByRole('group', { name: /تهیه سند معماری/ }).count()) === 1), 'checked card moved to Done column');
const title = done.getByRole('heading', { name: /تهیه سند معماری/ });
const deco = await title.evaluate((el) => getComputedStyle(el).textDecorationLine + ' / ' + getComputedStyle(el).opacity);
check(deco.startsWith('line-through'), `done title styled: ${deco}`);
await page.screenshot({ path: `${out}/k2_checked.png` });

// 4. Uncheck → back to the custom column it came from
await done.getByRole('checkbox', { name: /تهیه سند معماری/ }).click();
await page.waitForTimeout(200);
check(await eventually(async () => (await qa.getByRole('group', { name: /تهیه سند معماری/ }).count()) === 1), 'unchecked card returned to custom column');

// 5. Uncheck a seeded done card with no history → To Do (a web-project card: «همه وظایف»)
await page.getByRole('button', { name: /^همه وظایف/ }).click();
await done.getByRole('checkbox', { name: /بهینه‌سازی زمان بارگذاری/ }).click();
const todo = page.getByRole('region', { name: 'ستون برای انجام' });
check(await eventually(async () => (await todo.getByRole('group', { name: /بهینه‌سازی زمان بارگذاری/ }).count()) === 1), 'seeded done card unchecked → To Do');

// 6. Checkbox click must not open the inspector
check(await page.getByRole('dialog', { name: 'جزئیات وظیفه' }).count() === 0, 'checkbox did not open inspector');

// 7. Keyboard move: focus a card, Space, ArrowLeft x?, Space
const kcard = todo.getByRole('group', { name: /رفع آسیب‌پذیری/ });
await kcard.focus();
await page.keyboard.press('Space');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('Space');
const prog = page.getByRole('region', { name: 'ستون در حال انجام' });
check(await eventually(async () => (await prog.getByRole('group', { name: /رفع آسیب‌پذیری/ }).count()) === 1), 'keyboard move to next column');

// 8. Remove custom column → confirm migrate; the default target keeps the cards in progress
await openProject(/اپلیکیشن موبایل/);
await qa.getByRole('button', { name: 'اقدام‌های ستون تست کیفیت' }).click();
await page.getByRole('menuitem', { name: 'حذف ستون' }).click();
const confirmDelete = page.getByRole('dialog', { name: 'حذف ستون «تست کیفیت»' });
const migrateTarget = confirmDelete.getByRole('combobox', { name: 'ستون مقصد' });
check(await eventually(async () => (await migrateTarget.textContent()).includes('در حال انجام')), 'migrate target defaults to the same-status column');
await confirmDelete.getByRole('button', { name: 'انتقال و حذف ستون' }).click();
check(await eventually(async () => (await page.getByRole('region', { name: 'ستون تست کیفیت' }).count()) === 0), 'custom column removed');
check(await eventually(async () => (await prog.getByRole('group', { name: /تهیه سند معماری/ }).count()) === 1), 'displaced card now in progress');

// 9. Add task via + on a custom column pre-selects that column
await page.getByRole('button', { name: 'افزودن ستون جدید' }).click();
await page.getByLabel('نام ستون').fill('مسدود');
await page.getByRole('button', { name: 'افزودن ستون', exact: true }).click();
await page.getByRole('button', { name: 'افزودن وظیفه به مسدود' }).click();
const dialog = page.getByRole('dialog', { name: 'تعریف وظیفه جدید' });
check(await visible(dialog), 'composer opens from column +');
check(await eventually(async () => (await dialog.getByRole('combobox', { name: 'ستون بورد' }).textContent()).includes('مسدود')), 'composer preselects custom column');
await dialog.getByLabel('عنوان وظیفه').fill('بررسی وابستگی سرویس پیامک');
await dialog.getByRole('button', { name: 'ایجاد وظیفه' }).click();
check(await eventually(async () => (await page.getByRole('region', { name: 'ستون مسدود' }).getByRole('group', { name: /بررسی وابستگی/ }).count()) === 1), 'new task lands in custom column');
await page.screenshot({ path: `${out}/k3_final.png` });
await finish(browser);
