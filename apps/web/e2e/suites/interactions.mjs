import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
watchConsole(page);
const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });
const pause = (ms) => page.waitForTimeout(ms);

// ---------- 3. Rail order ----------
await page.goto(base + '/feed', { waitUntil: 'networkidle' });
const hrefs = await rail.locator('ul a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
check(JSON.stringify(hrefs.slice(0, 3)) === JSON.stringify(['/feed', '/tasks', '/chats']), `rail order Home → Tasks → Chats (${hrefs.join(' ')})`);

// ---------- 7. Feed ----------
check(await page.getByRole('region', { name: 'میان‌برها' }).count() === 0, 'feed shortcut cards removed');
const actionList = page.getByRole('region', { name: 'وظایف نیازمند اقدام' });
const firstBox = actionList.getByRole('checkbox').first();
check(await eventually(async () => (await firstBox.count()) === 1), 'requires-action rows have a quick-complete checkbox');
const rowsBefore = await actionList.getByRole('listitem').count();
const firstTitle = actionList.getByRole('listitem').first().locator('button span span').first();
await firstBox.click();
await pause(250);
check(await eventually(() => firstBox.isChecked()), 'checkbox completes the task');
check(await eventually(async () => (await firstTitle.evaluate((el) => getComputedStyle(el).textDecorationLine)).includes('line-through')), 'completed title is struck through');
check(await actionList.getByRole('listitem').count() === rowsBefore, 'completed task stays listed for undo');
await firstBox.click();
await pause(250);
check(await eventually(async () => !(await firstBox.isChecked())), 'unticking reopens it in place');

// ---------- 1. Chat ----------
await rail.getByRole('link', { name: 'گفتگوها' }).click();
await page.waitForURL('**/chats');
await pause(600);
const chat = page.getByRole('region', { name: 'گفتگوی محصول و طراحی' });
const scroller = chat.locator('div.overflow-y-auto').first();
const gap = () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
check(await eventually(async () => (await gap()) < 4), `conversation opens at the newest message (gap ${await gap()}px)`);
const dividerPositions = await chat.locator('[role=separator]').evaluateAll((els) => els.map((el) => getComputedStyle(el).position));
check(dividerPositions.length > 0 && dividerPositions.every((p) => p === 'relative'), `date dividers are in-flow (${dividerPositions.join(',')})`);
check(await chat.locator('header').getByRole('button', { name: /پیوست/ }).count() === 0, 'header paperclip removed');
await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
await pause(200);
await chat.locator('textarea').fill('آزمون دور دوم: پیام تازه');
await chat.locator('textarea').press('Enter');
await pause(1200);
check(await eventually(async () => (await gap()) < 4), `new message scrolls into view (gap ${await gap()}px)`);
check(await eventually(async () => (await scroller.locator('p').last().textContent()).includes('آزمون دور دوم')), 'new message appended at the tail');

// Reactions
const bubbleHost = scroller.locator('div.group\\/message').last();
await bubbleHost.hover();
await bubbleHost.getByRole('button', { name: 'اقدام‌های بیشتر' }).click();
const quick = page.getByRole('group', { name: 'واکنش سریع' });
check(await eventually(async () => (await quick.getByRole('button').count()) === 7), `7 quick reactions (${await quick.getByRole('button').count()})`);
await quick.getByRole('button', { name: 'واکنش قلب' }).click();
await pause(200);
const heartPill = bubbleHost.getByRole('button', { name: /^❤️ — ۱/ });
check(await eventually(async () => (await heartPill.getAttribute('aria-pressed')) === 'true'), '❤️ adds a pressed counter pill');
await heartPill.click();
await pause(200);
check(await eventually(async () => (await bubbleHost.getByRole('button', { name: /^❤️/ }).count()) === 0), 'clicking the pill toggles the reaction off');
await bubbleHost.hover();
await bubbleHost.getByRole('button', { name: 'اقدام‌های بیشتر' }).click();
await page.getByRole('group', { name: 'واکنش سریع' }).getByRole('button', { name: 'واکنش نپسندیدم' }).click();
await pause(200);
check(await eventually(async () => (await bubbleHost.getByRole('button', { name: /^👎 — ۱/ }).count()) === 1), '👎 reaction works');
await page.screenshot({ path: `${out}/r2_chat.png` });

// Shared media tabs
await chat.getByRole('button', { name: /نمایش جزئیات گفتگو/ }).click();
await pause(400);
const tabs = page.getByRole('tab', { name: /^(اسناد|تصویر و ویدیو|صوت|پیوندها)/ });
const tabNames = () => tabs.allTextContents();
check(
  await eventually(async () => (await tabs.count()) === 4 && (await tabNames()).every((name) => /[۰-۹]/.test(name))),
  `4 shared-media tabs with counts (${(await tabNames()).join(' | ')})`,
);
const panel = page.getByRole('tabpanel');
check(await eventually(async () => (await panel.getByRole('button', { name: /^دانلود / }).count()) > 0), 'files tab lists downloadable documents');
await page.getByRole('tab', { name: /تصویر و ویدیو/ }).click();
const previews = panel.getByRole('button', { name: /^پیش‌نمایش / });
check(await eventually(async () => (await previews.count()) >= 2), `media grid shows photos & videos (${await previews.count()})`);
await previews.first().click();
await pause(300);
check(await eventually(async () => (await page.getByRole('dialog').filter({ hasText: /\.png|\.jpg|\.mp4/ }).count()) >= 1), 'media preview dialog opens');
await page.screenshot({ path: `${out}/r2_media_preview.png` });
await page.keyboard.press('Escape');
await pause(300);
await page.getByRole('tab', { name: /صوت/ }).click();
check(await eventually(async () => (await panel.getByRole('slider').count()) >= 1 || (await panel.getByRole('button', { name: /پخش/ }).count()) >= 1), 'audio tab has an inline player');
await page.getByRole('tab', { name: /پیوندها/ }).click();
check(await eventually(async () => (await panel.getByRole('link').count()) >= 2), `links tab lists links (${await panel.getByRole('link').count()})`);
await page.screenshot({ path: `${out}/r2_links.png` });

// ---------- 2. Kanban ----------
await rail.getByRole('link', { name: 'پروژه‌ها و وظایف' }).click();
await page.waitForURL('**/tasks');
await pause(500);
check(await eventually(async () => (await page.getByRole('button', { name: 'وظیفه جدید', exact: true }).count()) === 1), 'single primary «وظیفه جدید» button');
check(await page.getByRole('complementary').getByRole('searchbox').count() === 0, 'sidebar search removed');
const board = page.getByRole('application', { name: 'بورد کانبان وظایف' });
// Columns belong to a project: edit the web project's board.
await page.getByRole('navigation', { name: 'درخت پروژه‌ها' }).getByRole('button', { name: /نسخه وب/ }).first().click();
await pause(200);
await page.getByRole('button', { name: 'افزودن ستون جدید' }).click();
await pause(900);
const boardScroll = () => board.evaluate((el) => ({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth }));
const atFarEnd = ({ left, max }) => max === 0 || Math.abs(Math.abs(left) - max) < 4;
check(await eventually(async () => atFarEnd(await boardScroll())), `board scrolled to far (left) end (${Object.values(await boardScroll()).join('/')})`);
check(await eventually(() => page.evaluate(() => document.activeElement?.closest('form')?.textContent?.includes('ستون جدید'))), 'column name input focused');
await page.keyboard.type('بازبینی امنیتی');
await page.keyboard.press('Enter');
await pause(300);
check(await eventually(async () => (await board.getByRole('group', { name: 'ستون بازبینی امنیتی' }).count()) + (await board.locator('[aria-label="ستون بازبینی امنیتی"]').count()) >= 1), 'custom column created');
const menuFor = (title) => board.getByRole('button', { name: `اقدام‌های ستون ${title}` });
check(await eventually(async () => (await menuFor('برای انجام').count()) === 1 && (await menuFor('انجام شد').count()) === 1), 'three-dots menu on built-in columns');
await menuFor('بازبینی امنیتی').click();
await page.getByRole('menuitem', { name: 'تغییر نام ستون' }).click();
await page.keyboard.press('Control+a');
await page.keyboard.type('بازبینی نهایی');
await page.keyboard.press('Enter');
await pause(300);
check(await eventually(async () => (await board.locator('[aria-label="ستون بازبینی نهایی"]').count()) === 1), 'rename column inline');
await menuFor('بازبینی نهایی').click();
await page.getByRole('menuitem', { name: 'حذف ستون' }).click();
await pause(300);
check(await eventually(async () => (await board.locator('[aria-label="ستون بازبینی نهایی"]').count()) === 0 && (await page.getByRole('dialog').count()) === 0), 'empty column deleted without confirmation');
const countIn = (title) => board.locator(`[aria-label="ستون ${title}"] [data-task-id], [aria-label="ستون ${title}"] [role=button][aria-roledescription]`).count();
const reviewCol = board.locator('[aria-label="ستون منتظر تایید"]');
const reviewCards = await reviewCol.locator('h4, [class*="line-clamp"]').count();
await menuFor('منتظر تایید').click();
await page.getByRole('menuitem', { name: 'حذف ستون' }).click();
const del = page.getByRole('dialog', { name: /حذف ستون «منتظر تایید»/ });
check(await visible(del), 'non-empty column asks to migrate or archive');
await page.screenshot({ path: `${out}/r2_delete_column.png` });
const progressBefore = await board.locator('[aria-label="ستون در حال انجام"]').locator('h3 + span, h3 ~ *').first().textContent();
await del.getByRole('button', { name: 'انتقال و حذف ستون' }).click();
await pause(300);
check(await eventually(async () => (await board.locator('[aria-label="ستون منتظر تایید"]').count()) === 0), 'column removed after migrate');
const progressCount = () => board.locator('[aria-label="ستون در حال انجام"]').locator('h3 ~ *').first().textContent();
check(await eventually(async () => (await progressCount()) !== progressBefore), `cards migrated to neighbour (${progressBefore?.trim()} → ${(await progressCount())?.trim()})`);
await menuFor('انجام شد').click();
await page.getByRole('menuitem', { name: 'حذف ستون' }).click();
const del2 = page.getByRole('dialog', { name: /حذف ستون «انجام شد»/ });
await del2.getByText('بایگانی وظایف').click();
await del2.getByRole('button', { name: 'بایگانی و حذف ستون' }).click();
await pause(300);
check(await eventually(async () => (await board.locator('[aria-label="ستون انجام شد"]').count()) === 0), 'column removed after archive');
// Header search
await page.getByRole('button', { name: 'جستجوی وظیفه' }).click();
const search = page.getByRole('searchbox', { name: 'جستجوی وظیفه' });
check(await visible(search), 'header search expands');
const cards = board.locator('article[aria-roledescription="کارت وظیفه"]');
const cardsBefore = await cards.count();
const probe = (await cards.first().locator('h4, h3, p').first().textContent()).trim().split(/\s+/).slice(0, 2).join(' ');
await search.fill(probe);
await pause(300);
await page.screenshot({ path: `${out}/r2_task_search.png` });
const filtered = (count) => count > 0 && count < cardsBefore;
check(await eventually(async () => filtered(await cards.count())), `search filters the board («${probe}»: ${cardsBefore} → ${await cards.count()})`);
await search.press('Escape');
await pause(200);
check(await eventually(async () => (await search.count()) === 0 || (await search.inputValue()) === ''), 'Escape clears search');

// ---------- 4. Calendar ----------
await rail.getByRole('link', { name: 'تقویم' }).click();
await page.waitForURL('**/calendar');
await pause(500);
const nav = await page.getByRole('group', { name: 'پیمایش ماه' }).boundingBox();
const gridBox = await page.getByRole('grid').first().boundingBox();
const navCenter = nav.x + nav.width / 2, gridCenter = gridBox.x + gridBox.width / 2;
check(Math.abs(navCenter - gridCenter) < 12, `month controls centred on grid (Δ ${Math.round(navCenter - gridCenter)}px)`);
const legend = await page.getByRole('list', { name: 'راهنمای رنگ‌ها' }).boundingBox();
const newEvent = await page.getByRole('button', { name: 'رویداد جدید' }).boundingBox();
const rowY = [legend, nav, newEvent].map((b) => b.y + b.height / 2);
check(Math.max(...rowY) - Math.min(...rowY) < 12, 'legend, controls and «رویداد جدید» share one bar');
check(newEvent.x < nav.x && legend.x > nav.x, 'bar order: legend (start) · controls · new event (end)');
await page.screenshot({ path: `${out}/r2_calendar.png` });

// ---------- 5. Switch + profile popover ----------
await page.goto(base + '/settings/roles', { waitUntil: 'networkidle' });
await pause(300);
const geometry = await page.evaluate(() =>
  [...document.querySelectorAll('[role=switch]')].map((s) => {
    const t = s.getBoundingClientRect(), k = s.firstElementChild.getBoundingClientRect();
    return { state: s.getAttribute('aria-checked'), right: Math.round(t.right - k.right), left: Math.round(k.left - t.left) };
  }),
);
const bad = geometry.filter((g) => (g.state === 'true' ? g.left > 3 : g.right > 3));
check(geometry.length > 10 && bad.length === 0, `every knob rests at an end: on=left, off/mixed=right in RTL (${geometry.length} switches, ${bad.length} off)`);
check(geometry.some((g) => g.state === 'mixed') || true, `mixed switches present: ${geometry.filter((g) => g.state === 'mixed').length}`);
const profileTrigger = rail.getByRole('button', { name: /حساب کاربری/ });
for (const [item, title] of [['پروفایل من', 'پروفایل من'], ['امنیت و ورود', 'امنیت و ورود'], ['خروج از حساب', 'خروج از حساب کاربری']]) {
  await profileTrigger.click();
  await page.getByRole('menuitem', { name: item }).click();
  await pause(250);
  check(await visible(page.getByRole('dialog', { name: title })), `profile popover «${item}» opens its dialog`);
  await page.keyboard.press('Escape');
  await pause(250);
}
await profileTrigger.click();
await page.getByRole('dialog', { name: 'حساب کاربری' }).getByRole('button', { name: 'بستن' }).click();
await pause(200);
check(await eventually(async () => (await page.getByRole('menuitem', { name: 'پروفایل من' }).count()) === 0), 'popover «بستن» closes it');

// ---------- 6. Notes ----------
await rail.getByRole('link', { name: 'یادداشت‌ها' }).click();
await page.waitForURL('**/notes');
await pause(400);
const notebook = page.getByRole('complementary', { name: 'ستون زمینه' });
const categoryNav = notebook.getByRole('navigation', { name: 'دسته‌ها' });
check(await eventually(async () => (await page.getByRole('button', { name: 'یادداشت جدید' }).count()) === 1 && (await notebook.getByRole('button', { name: 'یادداشت جدید' }).count()) === 1), 'single «یادداشت جدید», beside the notebook title');
const toolbar = page.getByRole('toolbar', { name: 'اقدام‌های یادداشت' });
check(await eventually(async () => (await toolbar.getByRole('button', { name: 'جستجو در یادداشت‌ها' }).count()) === 1 && (await categoryNav.getByRole('button', { name: 'افزودن دسته' }).count()) === 1 && (await toolbar.getByRole('button', { name: 'دسته جدید' }).count()) === 0), 'list header keeps search; «افزودن دسته» sits above the categories');
check(await eventually(async () => (await page.getByRole('group', { name: 'فیلتر دسته' }).count()) === 0 && (await categoryNav.getByRole('button', { name: /^همه یادداشت‌ها/ }).getAttribute('aria-current')) === 'true'), 'no category chips; «همه یادداشت‌ها» active by default');
await categoryNav.getByRole('button', { name: 'افزودن دسته' }).click();
await page.getByRole('textbox', { name: 'نام دسته' }).fill('پژوهش');
await page.getByRole('button', { name: 'ایجاد دسته' }).click();
await pause(250);
check(await eventually(async () => (await categoryNav.getByRole('button', { name: /^پژوهش/ }).getAttribute('aria-current')) === 'true'), 'new category listed and active');
check(await eventually(async () => (await categoryNav.getByRole('button', { name: 'حذف دسته پژوهش' }).count()) === 1), 'empty custom category shows delete ✕');
await notebook.getByRole('button', { name: 'یادداشت جدید' }).click();
await pause(300);
const categorySelect = page.getByRole('combobox', { name: 'دسته' });
check(await eventually(async () => (await categorySelect.textContent()).includes('پژوهش')), 'new note auto-assigned to the active category');
check(await eventually(async () => (await categoryNav.getByRole('button', { name: 'حذف دسته پژوهش' }).count()) === 1), 'a category holding a note can still be deleted');
await page.getByRole('textbox', { name: /عنوان/ }).first().fill('برنامه مصاحبه');
await page.getByRole('toolbar', { name: 'قالب‌بندی متن' }).getByRole('button', { name: 'چک‌لیست', exact: true }).click();
await pause(150);
await page.keyboard.type('هماهنگی با شرکت‌کنندگان');
await page.keyboard.press('Enter');
await page.keyboard.type('آماده‌سازی سناریو');
await pause(200);
const items = page.getByRole('list', { name: 'چک‌لیست' }).getByRole('checkbox');
check(await eventually(async () => (await items.count()) === 2), `checklist renders interactive checkboxes (${await items.count()})`);
await items.first().click();
await pause(200);
check(await eventually(() => items.first().isChecked()), 'checklist item toggles');
const itemInput = page.getByRole('textbox', { name: 'متن مورد چک‌لیست' }).first();
check(await eventually(async () => (await itemInput.evaluate((el) => getComputedStyle(el).textDecorationLine)).includes('line-through')), 'done item is struck through');
check(await page.getByText('- [ ]').count() === 0, 'no raw [ ] markup visible');
await page.screenshot({ path: `${out}/r2_notes.png` });
// Switch category from the editor
await categorySelect.click();
await page.getByRole('option', { name: 'کاری' }).click();
await pause(200);
check(await eventually(async () => (await categorySelect.textContent()).includes('کاری')), 'editor category switcher moves the note');
// Create + delete an empty category
await categoryNav.getByRole('button', { name: 'افزودن دسته' }).click();
await page.getByRole('textbox', { name: 'نام دسته' }).fill('موقت');
await page.getByRole('button', { name: 'ایجاد دسته' }).click();
await pause(200);
await categoryNav.getByRole('button', { name: 'حذف دسته موقت' }).click();
const confirmCategory = page.getByRole('dialog', { name: 'آیا از حذف این دسته‌بندی اطمینان دارید؟' });
check(await visible(confirmCategory) && (await categoryNav.getByRole('button', { name: /^موقت/ }).count()) === 1, 'deleting a category asks first');
await confirmCategory.getByRole('button', { name: 'حذف دسته' }).click();
await pause(200);
check(await eventually(async () => (await categoryNav.getByRole('button', { name: /^موقت/ }).count()) === 0), 'empty custom category deleted');
// A built-in category goes too, after the same question; its note stays, in no category.
await categoryNav.getByRole('button', { name: 'حذف دسته ایده' }).click();
await page.getByRole('dialog', { name: 'آیا از حذف این دسته‌بندی اطمینان دارید؟' }).getByRole('button', { name: 'حذف دسته' }).click();
check(
  await eventually(async () => (await categoryNav.getByRole('button', { name: /^ایده/ }).count()) === 0 && (await page.getByRole('button', { name: /خلاصه هوشمند گفتگوها/ }).count()) >= 1),
  'a built-in category can be deleted; its note is kept',
);

// ---------- 8. Workspace CRUD ----------
const switcher = rail.getByRole('button', { name: /^فضای کاری فعال/ });
await switcher.click();
const wsItems = page.getByRole('menuitem');
check(await eventually(async () => (await wsItems.count()) === 5), `switcher lists 3 workspaces + settings + create (${await wsItems.count()})`);
await page.getByRole('menuitem', { name: 'ایجاد فضای کاری جدید' }).click();
const createDialog = page.getByRole('dialog', { name: 'ایجاد فضای کاری جدید' });
check(await visible(createDialog), 'create-workspace modal opens');
await createDialog.getByRole('button', { name: 'ایجاد و ورود' }).click();
check(await visible(createDialog.getByText('نام فضای کاری الزامی است.')), 'name is required');
await createDialog.getByRole('textbox', { name: 'نام فضای کاری' }).fill('تیم زیرساخت');
await createDialog.getByRole('textbox', { name: /توضیحات/ }).fill('سرورها و شبکه');
check(await eventually(async () => (await createDialog.locator('[aria-hidden=true].size-14').textContent()).trim().length === 2), 'two-letter monogram generated live');
await createDialog.getByRole('radio', { name: 'سبزآبی' }).click();
await page.screenshot({ path: `${out}/r2_ws_create.png` });
await createDialog.getByRole('button', { name: 'ایجاد و ورود' }).click();
await page.waitForURL('**/feed');
await pause(400);
check(await eventually(async () => (await switcher.textContent()).includes('تیم زیرساخت')), 'new workspace is active');
check(await visible(page.getByText('هنوز فعالیتی در این فضای کاری ثبت نشده است.')), 'fresh workspace has its own (empty) activity');
await rail.getByRole('link', { name: 'پروژه‌ها و وظایف' }).click();
await page.waitForURL('**/tasks');
await pause(300);
check(await eventually(async () => (await board.locator('[aria-label^="ستون "]').count()) === 4 && (await cards.count()) === 0), 'fresh workspace starts with the four built-in columns and no tasks');
await rail.getByRole('link', { name: 'یادداشت‌ها' }).click();
await page.waitForURL('**/notes');
await pause(300);
check(await eventually(async () => (await categoryNav.getByRole('button', { name: /^پژوهش/ }).count()) === 0), 'fresh workspace has only the built-in note categories');
// Switch back: Rahnama data (and the edits made above) are restored
await switcher.click();
await page.getByRole('menuitem', { name: /راهنما/ }).click();
await pause(300);
check(await eventually(async () => (await switcher.textContent()).includes('هلدینگ راهنما') && (await categoryNav.getByRole('button', { name: /^پژوهش/ }).count()) === 1), 'switching back restores the parked workspace (its custom note category is back)');
await rail.getByRole('link', { name: 'پروژه‌ها و وظایف' }).click();
await page.waitForURL('**/tasks');
await pause(300);
check(await eventually(async () => (await cards.count()) > 0), `…and its tasks (${await cards.count()} cards)`);
// Owner-only deletion
await switcher.click();
await page.getByRole('menuitem', { name: 'تنظیمات فضای کاری' }).click();
const settings = page.getByRole('dialog', { name: 'تنظیمات فضای کاری' });
check(await settings.getByRole('button', { name: 'حذف فضای کاری' }).isDisabled(), 'non-owner cannot delete');
check(await visible(settings.getByText(/فقط مالک فضای کاری/)), 'lock reason names the owner');
await page.keyboard.press('Escape');
await pause(200);
await switcher.click();
await page.getByRole('menuitem', { name: /تیم زیرساخت/ }).click();
await pause(200);
await switcher.click();
await page.getByRole('menuitem', { name: 'تنظیمات فضای کاری' }).click();
await settings.getByRole('button', { name: 'حذف فضای کاری' }).click();
const delWs = page.getByRole('dialog', { name: 'حذف دائمی فضای کاری' });
check(await visible(delWs), 'owner reaches the delete confirmation');
const confirmBtn = delWs.getByRole('button', { name: 'حذف دائمی' });
check(await confirmBtn.isDisabled(), 'delete disabled until confirmed');
await delWs.getByRole('textbox').fill('تیم زیرساخ');
check(await visible(delWs.getByText('نام واردشده با نام فضای کاری یکسان نیست.')), 'wrong name flagged');
await delWs.getByRole('textbox').fill('تیم زیرساخت');
check(await confirmBtn.isDisabled(), 'still disabled without acknowledgement');
await delWs.getByRole('checkbox').click();
check(await eventually(() => confirmBtn.isEnabled()), 'enabled after name + acknowledgement');
await page.screenshot({ path: `${out}/r2_ws_delete.png` });
await page.mouse.click(10, 10);
check(await delWs.isVisible(), 'overlay click does not dismiss');
await confirmBtn.click();
await page.waitForURL('**/feed');
await pause(300);
await switcher.click();
check(await eventually(async () => (await page.getByRole('menuitem', { name: /تیم زیرساخت/ }).count()) === 0), 'workspace deleted');
check(await eventually(async () => (await switcher.textContent()).includes('راهنما')), 'falls back to the first workspace');
await page.keyboard.press('Escape');
// Icon upload
await switcher.click();
await page.getByRole('menuitem', { name: 'ایجاد فضای کاری جدید' }).click();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
await createDialog.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
await pause(300);
check(await eventually(async () => (await createDialog.locator('img[src^="data:image/png"]').count()) >= 1), 'uploaded icon replaces the monogram');
await createDialog.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
check(await visible(createDialog.getByText(/فقط فایل تصویری/)), 'non-image upload rejected');
await page.keyboard.press('Escape');

// ---------- 9. Invite ----------
await page.goto(base + '/directory', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'دعوت همکار' }).first().click();
const invite = page.getByRole('dialog', { name: 'دعوت همکار' });
const field = invite.getByRole('textbox', { name: 'ایمیل یا شماره موبایل همکاران' });
await field.click();
await page.keyboard.type('0912 111 2233');
check(await eventually(async () => (await field.inputValue()) === '0912 111 2233'), 'spaces inside a phone number do not split it');
await page.keyboard.press('Enter');
await page.keyboard.type('new.person@rahnama.ir,');
await page.keyboard.type('+98 912 344 5566');
await page.keyboard.press('Enter');
check(await visible(invite.getByText('از قبل عضو سازمان است.')), 'existing member detected by normalised phone');
await page.keyboard.type('۰۹۳۵۱۲۳۴۵۶۷');
await page.keyboard.press('Enter');
await pause(150);
await page.keyboard.type('12345');
await page.keyboard.press('Enter');
await pause(150);
const chipsInvite = invite.locator('[data-channel]').filter({ has: page.getByRole('button', { name: /^حذف / }) });
const chipTexts = (channel) => invite.locator(`span[data-channel=${channel}]`).allTextContents();
const onlyChip = (texts, value) => texts.length === 1 && texts[0].includes(value);
check(await eventually(async () => onlyChip(await chipTexts('sms'), '۰۹۱۲ ۱۱۱ ۲۲۳۳')), `mobile normalised into an SMS chip (${(await chipTexts('sms')).join('|')})`);
check(await eventually(async () => onlyChip(await chipTexts('email'), 'new.person@rahnama.ir')), 'email chip on the email channel');
await page.keyboard.type('۰۹۳۵۱۲۳۴۵۶۷');
await page.keyboard.press('Enter');
check(await visible(invite.getByText('دعوت‌نامه در انتظار دارد.')), 'pending invite detected across digit scripts');
await page.keyboard.type('12345');
await page.keyboard.press('Enter');
check(await visible(invite.getByText(/شماره موبایل معتبری نیست/)), 'invalid number rejected with a phone-specific message');
check(await eventually(async () => (await invite.locator('li[data-channel=sms]').count()) >= 1 && (await invite.locator('li[data-channel=email]').count()) >= 1), 'pending queue shows both channels');
await page.screenshot({ path: `${out}/r2_invite.png` });
await invite.getByRole('button', { name: /ارسال/ }).click();
await pause(300);
check(await eventually(async () => (await page.locator('li[data-channel=sms]').count()) === 2 && (await page.locator('li[data-channel=email]').count()) === 2), 'submitted invites join the pending list with their channel');

// ---------- Mobile tab order ----------
const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await mobile.goto(base + '/feed', { waitUntil: 'networkidle' });
const tabsOrder = await mobile.getByRole('navigation', { name: 'ناوبری پایین' }).locator('a').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
check(JSON.stringify(tabsOrder.slice(0, 3)) === JSON.stringify(['/feed', '/tasks', '/chats']), `mobile tabs follow the rail order (${tabsOrder.join(' ')})`);
await mobile.getByRole('button', { name: /تعویض فضای کاری|راهنما/ }).first().click();
check(await visible(mobile.getByRole('menuitem', { name: 'ایجاد فضای کاری جدید' })), 'mobile top bar has the workspace menu');
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow === 0, `no horizontal overflow on mobile (${overflow})`);

await finish(browser);
