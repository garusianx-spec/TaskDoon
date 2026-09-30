import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

// Phase 3.2 in the demo: scheduled messages (the composer's «زمان‌بندی ارسال», the bar above it,
// «ارسال فوری», «لغو / حذف», and a schedule that goes out on its own when its time comes), the
// out-of-office auto-reply of a teammate on leave (direct chats only, once a day), and the
// working-hours settings. The server side (worker, 24-hour limit, working hours) is the live
// flow's and the API suite's.
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
watchConsole(page);
// A clock the suite can move forward: schedules go out when their time comes.
await page.clock.install();
const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });

/* ---------- 1. Scheduling from the composer ---------- */

await page.goto(base + '/chats', { waitUntil: 'networkidle' });
const chat = page.getByRole('region', { name: 'گفتگوی محصول و طراحی' });
check(await visible(chat), 'the product conversation is open');
const input = page.getByLabel('نوشتن پیام در محصول و طراحی');
const scheduleButton = chat.getByRole('button', { name: 'زمان‌بندی ارسال' });
check(await scheduleButton.isDisabled(), '«زمان‌بندی ارسال» waits for a message to schedule');

await input.fill('یادآوری: جلسه بازبینی طراحی');
await scheduleButton.click();
let dialog = page.getByRole('dialog', { name: 'زمان‌بندی ارسال پیام' });
check(await visible(dialog), 'the clock beside «ارسال پیام» opens the scheduler');
check(await visible(dialog.getByText('یادآوری: جلسه بازبینی طراحی')), '…showing the message being scheduled');
check((await dialog.getByRole('group', { name: 'زمان‌های پیشنهادی' }).getByRole('button').count()) >= 2, '…with shortcuts');
await dialog.getByRole('button', { name: 'یک ساعت دیگر' }).click();
check(await visible(dialog.getByText(/^ارسال در /)), 'the chosen time is spelled out in Jalali');
await dialog.getByRole('button', { name: 'زمان‌بندی ارسال' }).click();
check(await eventually(async () => (await dialog.count()) === 0), 'scheduling closes the dialog');
check((await input.inputValue()) === '', 'the composer is cleared');
check((await chat.getByText('یادآوری: جلسه بازبینی طراحی').count()) === 0, 'the message is not in the thread yet');
const bar = chat.getByRole('button', { name: /پیام‌های زمان‌بندی‌شده/ });
check(await visible(bar), 'the conversation shows «پیام‌های زمان‌بندی‌شده»');
check((await bar.textContent()).includes('۱'), '…with one waiting');

// Right-click (a long press on a phone) on «ارسال پیام» schedules too; a time in the past is refused.
await input.fill('پیام دوم برای فردا');
await chat.getByRole('button', { name: 'ارسال پیام' }).click({ button: 'right' });
dialog = page.getByRole('dialog', { name: 'زمان‌بندی ارسال پیام' });
check(await visible(dialog), 'right-clicking «ارسال پیام» opens the scheduler');
const now = await page.evaluate(() => Date.now());
const past = new Date(now - 30 * 60_000);
if (past.getDate() === new Date(now).getDate()) {
  await dialog.getByLabel('ساعت ارسال').fill(`${String(past.getHours()).padStart(2, '0')}:${String(past.getMinutes()).padStart(2, '0')}`);
  await dialog.getByRole('button', { name: 'زمان‌بندی ارسال' }).click();
  check(await visible(dialog.getByRole('alert').filter({ hasText: 'دست‌کم یک دقیقه بعد' })), 'a time in the past is refused');
}
await dialog.getByRole('button', { name: /^فردا ساعت/ }).click();
await dialog.getByRole('button', { name: 'زمان‌بندی ارسال' }).click();
check(await eventually(async () => (await bar.textContent()).includes('۲')), 'two messages wait now');

await bar.click();
const list = page.getByRole('dialog', { name: 'پیام‌های زمان‌بندی‌شده' });
check(await visible(list), 'the bar opens the list of scheduled messages');
const items = list.getByRole('list', { name: 'پیام‌های در انتظار ارسال' }).getByRole('listitem');
check((await items.count()) === 2, '…both of them, soonest first');
check((await items.first().textContent()).includes('یادآوری: جلسه بازبینی طراحی'), '…the sooner one on top');
check(await visible(items.first().getByText(/^ارسال در /)), '…each with its time');
await page.screenshot({ path: `${out}/p32_scheduled.png` });

await items.filter({ hasText: 'یادآوری' }).getByRole('button', { name: 'ارسال فوری' }).click();
check(await eventually(async () => (await items.count()) === 1), '«ارسال فوری» takes it off the list');
check(await visible(chat.getByText('یادآوری: جلسه بازبینی طراحی')), '…and sends it into the thread');
await items.filter({ hasText: 'پیام دوم' }).getByRole('button', { name: 'لغو / حذف' }).click();
check(await eventually(async () => (await list.count()) === 0), '«لغو / حذف» empties the list, which closes');
check(await eventually(async () => (await bar.count()) === 0), 'no bar once nothing waits');
check((await chat.getByText('پیام دوم برای فردا').count()) === 0, 'the cancelled message is never sent');

// Its time comes and it goes out by itself.
await input.fill('گزارش هفتگی ضمیمه شد');
await scheduleButton.click();
dialog = page.getByRole('dialog', { name: 'زمان‌بندی ارسال پیام' });
await dialog.getByRole('button', { name: 'یک ساعت دیگر' }).click();
await dialog.getByRole('button', { name: 'زمان‌بندی ارسال' }).click();
check(await visible(bar), 'a third one waits');
check((await list.count()) === 0, '…in the bar: the list does not open by itself');
await page.clock.fastForward('01:10:00');
check(await eventually(async () => (await chat.getByText('گزارش هفتگی ضمیمه شد').count()) === 1), 'when its time comes, it is sent by itself');
check(await eventually(async () => (await bar.count()) === 0), '…and leaves the bar');

/* ---------- 2. A teammate's out-of-office auto-reply ---------- */

await page.getByRole('button', { name: 'گفتگوی جدید' }).first().click();
dialog = page.getByRole('dialog', { name: 'گفتگوی جدید' });
await dialog.getByRole('radio', { name: /لیلا قاسمی/ }).click();
await dialog.getByRole('button', { name: 'شروع گفتگو' }).click();
const dm = page.getByRole('region', { name: 'گفتگوی لیلا قاسمی' });
check(await visible(dm), 'a direct chat with Leila (on leave) opens');
await page.getByLabel('نوشتن پیام در لیلا قاسمی').fill('سلام، گزارش مالی ماه آماده است؟');
await page.getByLabel('نوشتن پیام در لیلا قاسمی').press('Enter');
const replies = dm.getByText('پاسخ خودکار', { exact: true });
check(await eventually(async () => (await replies.count()) === 1), 'her auto-reply answers, marked «پاسخ خودکار»');
check(await visible(dm.getByText(/در مرخصی هستم/)), '…with her out-of-office text');
await page.getByLabel('نوشتن پیام در لیلا قاسمی').fill('ممنون، منتظر می‌مانم.');
await page.getByLabel('نوشتن پیام در لیلا قاسمی').press('Enter');
await page.waitForTimeout(300);
check((await replies.count()) === 1, 'a second message the same day gets no second answer');
await page.screenshot({ path: `${out}/p32_autoreply.png` });

await page.getByRole('button', { name: /کمپین نوروزی/ }).first().click();
const group = page.getByRole('region', { name: 'گفتگوی کمپین نوروزی' });
await page.getByLabel('نوشتن پیام در کمپین نوروزی').fill('لیلا، بودجه کمپین تأیید شد؟');
await page.getByLabel('نوشتن پیام در کمپین نوروزی').press('Enter');
check(await visible(group.getByText('لیلا، بودجه کمپین تأیید شد؟')), 'a message in a group she is in is sent');
await page.waitForTimeout(300);
check((await group.getByText('پاسخ خودکار', { exact: true }).count()) === 0, 'groups never get auto-replies');

/* ---------- 3. My working hours ---------- */

const openSettings = async () => {
  await rail.getByRole('button', { name: /حساب کاربری/ }).click();
  await page.getByRole('menuitem', { name: 'ساعات کاری و پاسخ خودکار' }).click();
  const settings = page.getByRole('dialog', { name: 'ساعات کاری و پاسخ خودکار' });
  await settings.waitFor();
  return settings;
};
let settings = await openSettings();
check(await visible(settings), 'the account menu opens «ساعات کاری و پاسخ خودکار»');
const toggle = settings.getByRole('switch', { name: 'پاسخ خودکار خارج از ساعت کاری' });
check((await toggle.getAttribute('aria-checked')) === 'false', 'the auto-reply starts off');
check((await settings.getByRole('button', { name: 'شنبه', exact: true }).getAttribute('aria-pressed')) === 'true', 'Saturday is a working day by default');
check((await settings.getByRole('button', { name: 'جمعه', exact: true }).getAttribute('aria-pressed')) === 'false', '…Friday is not');
await settings.getByLabel('پایان ساعت کاری').fill('09:00');
await settings.getByRole('button', { name: 'ذخیره' }).click();
check(await visible(settings.getByRole('alert').filter({ hasText: 'باید با ساعت شروع فرق کند' })), 'the same start and end are refused');
await toggle.click();
await settings.getByRole('button', { name: 'پنجشنبه', exact: true }).click();
await settings.getByLabel('پایان ساعت کاری').fill('17:30');
await settings.getByLabel('متن پاسخ خودکار').fill('تا شنبه در سفر کاری هستم.');
await settings.getByRole('button', { name: 'ذخیره' }).click();
check(await eventually(async () => (await settings.count()) === 0), 'saving closes the settings');
settings = await openSettings();
check((await settings.getByRole('switch', { name: 'پاسخ خودکار خارج از ساعت کاری' }).getAttribute('aria-checked')) === 'true', 'the auto-reply stays on');
check((await settings.getByRole('button', { name: 'پنجشنبه', exact: true }).getAttribute('aria-pressed')) === 'true', 'Thursday is now a working day');
check((await settings.getByLabel('پایان ساعت کاری').inputValue()) === '17:30', 'the new end of the day is kept');
check((await settings.getByLabel('متن پاسخ خودکار').inputValue()) === 'تا شنبه در سفر کاری هستم.', 'the new text is kept');
await page.screenshot({ path: `${out}/p32_hours.png` });
await page.keyboard.press('Escape');

await finish(browser);
