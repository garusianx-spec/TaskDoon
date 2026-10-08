/**
 * The live app against a running TaskDoon API: two people, two browsers, one workspace.
 *
 *   API_LOG=/path/to/api.log npm run test:e2e:live      # BASE_URL defaults to http://localhost:3000
 *
 * The API must run with the console SMS driver (the default outside production) and log to
 * `API_LOG`: sign-in codes and invitation links are read from there. The web app must be built
 * or served with the live data source (the default), proxying `/api/v1` and `/rt` to that API, on
 * an origin the API allows (its PUBLIC_WEB_ORIGIN or CORS_ORIGINS; http://localhost:3000 in dev).
 *
 * Covers: sign-up by SMS code → first workspace → project → invitation by SMS → the invitee
 * joins through the link → a task created, assigned and completed by one person appears and
 * moves live for the other → a direct chat with live delivery, typing, read receipts and
 * reactions (❤️, 👎) → notification quick views and "mark all read" persisted → the profile
 * menu signs out and the session stays gone after a reload. M4 adds files and images sent in the
 * chat (live, previewed, downloaded under their Persian names), a voice note from the microphone,
 * the shared-media tabs, «تبدیل پیام به وظیفه» with its chip and the task's «پیام مبدأ» link,
 * subtask reordering, task attachments and a workspace icon. Phase 2 adds a message whose
 * acknowledgement is lost (marked unsent, then sent again once with the same client id), files
 * waiting in a preview, a picture sent as a file, voice-note speed, notes that reach the server
 * only with their first words, and the free plan's project limit. Any console error or warning —
 * hydration mismatches included — fails the run.
 */
import { readFileSync, statSync } from 'node:fs';
import { check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

/** The API accepts its cookie routes (refresh, sign-out) only from its web origin: PUBLIC_WEB_ORIGIN or CORS_ORIGINS. */
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const apiLog = process.env.API_LOG;
if (!apiLog) {
  console.error('Set API_LOG to the file the API logs to: the console SMS driver writes sign-in codes and invitation links there.');
  process.exit(2);
}

const OTP = /"text":"کد ورود شما به تسک‌دون: (\d{6})"/g;
const INVITE = /"text":"[^"]*?(https?:\/\/[^"\s]+\/invite\?token=[^"\s]+)"/g;
const runId = String(Date.now()).slice(-4);
const phoneOf = () => `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const ownerPhone = phoneOf();
let guestPhone = phoneOf();
while (guestPhone === ownerPhone) guestPhone = phoneOf();
const ownerName = `سحر آزمون ${runId}`;
const guestName = `علی آزمون ${runId}`;
const workspaceName = `فضای آزمون ${runId}`;
const projectName = 'بازطراحی اپلیکیشن';
const taskTitle = `بازبینی جریان ورود ${runId}`;

const logSize = () => statSync(apiLog).size;

/** The newest SMS matching `pattern` written to the API log after byte `from`. */
async function smsAfter(from, pattern, what) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const text = readFileSync(apiLog).subarray(from).toString('utf8');
    const match = [...text.matchAll(pattern)].at(-1);
    if (match?.[1]) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No ${what} in${apiLog} within 20 s.`);
}

/** Phone → code → (new accounts) name. */
async function signIn(page, phone, fullName) {
  const phoneBox = page.getByRole('textbox', { name: 'شماره موبایل' });
  await phoneBox.waitFor({ timeout: 30_000 });
  await phoneBox.fill(phone);
  const from = logSize();
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  const code = await smsAfter(from, OTP, 'sign-in code');
  await page.getByRole('textbox', { name: 'کد ورود' }).fill(code);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  const nameBox = page.getByRole('textbox', { name: 'نام و نام خانوادگی' });
  await nameBox.waitFor({ timeout: 15_000 });
  await nameBox.fill(fullName);
  await page.getByRole('button', { name: 'ساخت حساب و ورود' }).click();
}

// A fake microphone (a steady tone) for the voice note, granted without a prompt.
const browser = await launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const viewport = { width: 1440, height: 900 };
const owner = await (await browser.newContext({ viewport, locale: 'fa-IR', permissions: ['microphone'] })).newPage();
const guestContext = await browser.newContext({ viewport, locale: 'fa-IR' });
const guest = await guestContext.newPage();
watchConsole(owner);
watchConsole(guest);

for (const [name, page] of [['owner', owner], ['guest', guest]]) {
  page.on('response', async (response) => {
    if (response.status() !== 400) return;
    console.log(
      'HTTP400', new Date().toISOString(), name,
      response.request().method(), new URL(response.url()).pathname,
      await response.text().catch(() => '[unreadable]'),
    );
  });
}

const railOf = (page) => page.getByRole('navigation', { name: 'ناوبری اصلی' });
const quickCreate = async (page, item) => {
  await railOf(page).getByRole('button', { name: 'ایجاد سریع' }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

try {
  /* ------------------------------------------------ owner: sign-up and first workspace */

  await owner.goto(`${base}/feed`);
  check(await visible(owner.getByRole('heading', { name: 'ورود به تسک‌دون' }), 30_000), 'signed out: the sign-in screen replaces the workspace');
  check((await owner.locator('html').getAttribute('dir')) === 'rtl', 'the document is right-to-left');
  await signIn(owner, ownerPhone, ownerName);
  check(await visible(owner.getByRole('heading', { name: `${ownerName}، خوش آمدید` }), 15_000), 'a new account is asked for its first workspace');
  await owner.getByRole('textbox', { name: 'نام فضای کاری' }).fill(workspaceName);
  await owner.getByLabel('رمز مدیر').fill('Taskin-2026!');
  await owner.getByRole('button', { name: 'ساخت فضای کاری' }).click();
  check(await visible(railOf(owner), 20_000), 'the workspace loads after it is created');
  check(await visible(owner.getByText(workspaceName).first()), `the new workspace «${workspaceName}» is the active one`);
  const font = await owner.evaluate(() => getComputedStyle(document.body).fontFamily);
  check(font.includes('IRANYekanX'), `IRANYekanX is the body font (${font})`);

  /* ------------------------------------------------ owner: a project, then an invitation */

  await quickCreate(owner, 'پروژه جدید');
  let dialog = owner.getByRole('dialog', { name: 'پروژه جدید' });
  await dialog.getByLabel('نام پروژه').fill(projectName);
  check((await dialog.getByLabel('کلید پروژه').inputValue()) === 'P1', 'a Persian project name gets the key P1');
  await dialog.getByRole('button', { name: 'ایجاد پروژه' }).click();
  await owner.waitForURL('**/tasks');
  const tree = owner.getByRole('navigation', { name: 'درخت پروژه‌ها' });
  // Anchored: the owner's rows also carry a «حذف پروژه …» button (Phase 3.1).
  check(await visible(tree.getByRole('button', { name: new RegExp(`^${projectName}`) })), 'the project appears in the project tree');

  await quickCreate(owner, 'دعوت همکار');
  dialog = owner.getByRole('dialog', { name: 'دعوت همکار' });
  const addresses = dialog.getByLabel('ایمیل یا شماره موبایل همکاران');
  await addresses.fill(guestPhone);
  await addresses.press('Enter');
  const beforeInvite = logSize();
  await dialog.getByRole('button', { name: 'ارسال دعوت‌نامه' }).click();
  const link = await smsAfter(beforeInvite, INVITE, 'invitation link');
  check(link.includes('/invite?token='), 'the invitation SMS carries a join link');

  /* ------------------------------------------------ guest: joins through the link */

  const invite = new URL(link);
  await guest.goto(`${base}${invite.pathname}${invite.search}`);
  check(await visible(guest.getByRole('heading', { name: 'پیوستن به فضای کاری' }), 30_000), 'the invitation link asks the guest to sign in to join');
  await signIn(guest, guestPhone, guestName);
  await guest.waitForURL('**/feed', { timeout: 20_000 });
  check(await visible(railOf(guest), 20_000), 'the guest lands on the desk');
  check(await visible(guest.getByText(workspaceName).first()), 'the guest is in the inviting workspace');

  /* ------------------------------------------------ tasks: created by one, seen live by the other */

  await railOf(guest).getByRole('link', { name: 'پروژه‌ها و وظایف' }).click();
  await guest.waitForURL('**/tasks');
  check(await eventually(async () => (await guest.getByRole('navigation', { name: 'درخت پروژه‌ها' }).getByRole('button', { name: new RegExp(projectName) }).count()) === 1, 10_000), 'the guest sees the project');

  await quickCreate(owner, 'وظیفه جدید');
  dialog = owner.getByRole('dialog', { name: 'تعریف وظیفه جدید' });
  await dialog.getByLabel('عنوان وظیفه').fill(taskTitle);
  check(await eventually(async () => (await dialog.getByRole('checkbox', { name: guestName }).count()) === 1, 10_000), 'the owner can assign the new member');
  await dialog.getByRole('checkbox', { name: guestName }).click();
  await dialog.getByRole('button', { name: 'ایجاد وظیفه' }).click();
  const ownerCard = owner.getByRole('group', { name: new RegExp(taskTitle) });
  check(await visible(ownerCard), 'the task appears on the owner’s board');
  // A new task opens in the (modal) task dialog; close it to get back to the board.
  await owner.keyboard.press('Escape');

  const guestCard = guest.getByRole('group', { name: new RegExp(taskTitle) });
  check(await visible(guestCard, 10_000), 'the task appears live on the guest’s board');

  await owner.getByRole('checkbox', { name: `انجام شد: ${taskTitle}` }).click();
  const guestDone = guest.getByRole('region', { name: 'ستون انجام شد' });
  check(await eventually(async () => (await guestDone.getByRole('group', { name: new RegExp(taskTitle) }).count()) === 1, 10_000), 'completing it moves it to «انجام شد» live for the guest');
  await owner.reload();
  check(await eventually(async () => (await owner.getByRole('region', { name: 'ستون انجام شد' }).getByRole('group', { name: new RegExp(taskTitle) }).count()) === 1, 15_000), 'the completion is stored: still done after a reload');
  await owner.screenshot({ path: `${out}/live_board.png` });

  /* ------------------------------------------------ chat: live delivery, typing, receipts, reactions */

  await quickCreate(owner, 'گفتگوی جدید');
  dialog = owner.getByRole('dialog', { name: 'گفتگوی جدید' });
  await dialog.getByRole('radio', { name: new RegExp(guestName) }).click();
  await dialog.getByRole('button', { name: 'شروع گفتگو' }).click();
  await owner.waitForURL('**/chats');
  const ownerThread = owner.getByRole('region', { name: `گفتگوی ${guestName}` });
  check(await visible(ownerThread, 10_000), 'the direct chat opens for the owner');
  // Phase 3.1: the project opened its own channel with it, its creator in it.
  check(await visible(owner.getByRole('button', { name: new RegExp(projectName) }).first(), 10_000), 'the project’s own channel is in the owner’s chat list');
  const hello = `سلام ${guestName}، بورد را ببین.`;
  const ownerComposer = owner.getByRole('textbox', { name: `نوشتن پیام در ${guestName}` });
  await ownerComposer.fill(hello);
  await ownerComposer.press('Enter');
  check(await visible(ownerThread.getByText(hello)), 'the owner’s message shows at once');

  await railOf(guest).getByRole('link', { name: 'گفتگوها' }).click();
  await guest.waitForURL('**/chats');
  const guestEntry = guest.getByRole('button', { name: new RegExp(ownerName) }).first();
  check(await visible(guestEntry, 10_000), 'the new chat appears live in the guest’s list');
  check((await guest.getByRole('button', { name: new RegExp(projectName) }).count()) === 0, 'the project’s channel is its members’ only: not in the guest’s list');
  await guestEntry.click();
  const guestThread = guest.getByRole('region', { name: `گفتگوی ${ownerName}` });
  check(await visible(guestThread.getByText(hello), 10_000), 'the guest receives the message');
  check(await eventually(async () => (await ownerThread.getByRole('img', { name: 'خوانده شد' }).count()) >= 1, 10_000), 'the owner sees the read receipt');

  const guestComposer = guest.getByRole('textbox', { name: `نوشتن پیام در ${ownerName}` });
  await guestComposer.pressSequentially('دارم می‌نویسم', { delay: 30 });
  check(await eventually(async () => ((await owner.getByTestId('typing-indicator').textContent()) ?? '').includes(`${guestName} در حال نوشتن است`), 10_000), 'the owner sees the guest typing');
  await guestComposer.fill('دیدم، ممنون!');
  await guestComposer.press('Enter');
  check(await visible(ownerThread.getByText('دیدم، ممنون!'), 10_000), 'the owner receives the reply live');
  check(await eventually(async () => ((await owner.getByTestId('typing-indicator').textContent()) ?? '') === '', 10_000), 'the typing line clears after the reply');

  const bubbleOf = (thread, text) => thread.locator('div.group\\/message').filter({ hasText: text }).last();
  const react = async (page, thread, text, label) => {
    const bubble = bubbleOf(thread, text);
    await bubble.hover();
    await bubble.getByRole('button', { name: 'اقدام‌های بیشتر' }).click();
    await page.getByRole('group', { name: 'واکنش سریع' }).getByRole('button', { name: label }).click();
  };
  await react(guest, guestThread, hello, 'واکنش قلب');
  check(await eventually(async () => (await ownerThread.getByRole('button', { name: '❤️ — ۱ نفر' }).count()) === 1, 10_000), '❤️ from the guest shows live for the owner');
  await react(guest, guestThread, hello, 'واکنش نپسندیدم');
  check(await eventually(async () => (await ownerThread.getByRole('button', { name: '👎 — ۱ نفر' }).count()) === 1, 10_000), '👎 from the guest shows live for the owner');
  await guestThread.getByRole('button', { name: '👎 — ۱ نفر' }).click();
  check(await eventually(async () => (await ownerThread.getByRole('button', { name: /^👎/ }).count()) === 0, 10_000), 'toggling 👎 off removes it for the owner');
  await guest.reload();
  await guestEntry.click();
  check(await eventually(async () => (await guest.getByRole('region', { name: `گفتگوی ${ownerName}` }).getByRole('button', { name: '❤️ — ۱ نفر' }).count()) === 1, 15_000), 'the ❤️ is stored: still there after a reload');
  await owner.screenshot({ path: `${out}/live_chat.png` });

  /* ------------------------------------------------ Phase 2: an unsent message, sent again once */

  // The owner's socket now runs through a relay that can lose one send's acknowledgement: the API
  // stores the message, but the owner's app hears nothing back, times out and marks its copy
  // unsent. «ارسال دوباره» repeats the send with its first client id, so the guest has it once.
  let loseNextAck = false;
  let relayed = false;
  const lostAcks = new Set();
  await owner.routeWebSocket(/\/rt\//, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((frame) => {
      const send = typeof frame === 'string' ? /^42(?:\/[^,]*,)?(\d+)\["message:send"/.exec(frame) : null;
      if (send?.[1] && loseNextAck) {
        loseNextAck = false;
        lostAcks.add(send[1]);
      }
      server.send(frame);
    });
    server.onMessage((frame) => {
      const ack = typeof frame === 'string' ? /^43(?:\/[^,]*,)?(\d+)\[/.exec(frame) : null;
      if (ack?.[1] && lostAcks.delete(ack[1])) return;
      if (ack) relayed = true;
      socket.send(frame);
    });
  });
  await owner.reload();
  await owner.getByRole('button', { name: new RegExp(guestName) }).first().click();
  check(await eventually(() => relayed, 20_000), 'the owner’s socket reconnects through the relay');
  const unsent = `پیامی که پاسخش گم شد ${runId}`;
  loseNextAck = true;
  await ownerComposer.fill(unsent);
  await ownerComposer.press('Enter');
  check(await visible(guestThread.getByText(unsent), 10_000), 'the API stores the message: the guest has it');
  const unsentRow = ownerThread.getByRole('group', { name: 'پیام ارسال نشد' });
  check(await visible(unsentRow, 20_000), 'with no acknowledgement the owner’s copy is marked «ارسال نشد», with «ارسال دوباره»');
  await owner.screenshot({ path: `${out}/live_unsent.png` });
  await unsentRow.getByRole('button', { name: 'ارسال دوباره' }).click();
  check(await eventually(async () => (await unsentRow.count()) === 0, 10_000), '«ارسال دوباره» goes through');
  check(
    await eventually(async () => (await ownerThread.getByText(unsent).count()) === 1 && (await guestThread.getByText(unsent).count()) === 1),
    'the resend keeps its client id: one message for both, not two',
  );
  await guest.reload();
  await guestEntry.click();
  check(await eventually(async () => (await guestThread.getByText(unsent).count()) === 1, 15_000), 'the server holds it once: still one after a reload');

  /* ------------------------------------------------ M4: files and images in the chat */

  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  const PDF = Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n${' '.repeat(200)}\n%%EOF\n`);
  const guestChat = guest.getByRole('region', { name: `گفتگوی ${ownerName}` });
  await owner.getByTestId('chat-file-input').setInputFiles([
    { name: 'گزارش فصل.pdf', mimeType: 'application/pdf', buffer: PDF },
    { name: 'نمودار.png', mimeType: 'image/png', buffer: PNG },
  ]);
  // Picked files wait in the preview (Phase 2) until they are sent.
  let preview = owner.getByRole('dialog', { name: 'ارسال پیوست' });
  await preview.getByRole('button', { name: 'ارسال', exact: true }).click();
  check(await visible(ownerThread.getByText('گزارش فصل.pdf')), 'a picked file shows in the thread at once');
  check(await visible(guestChat.getByText('گزارش فصل.pdf'), 15_000), 'the file arrives live for the guest');
  const shownImage = guestChat.getByRole('img', { name: 'نمودار.png' });
  check(
    await eventually(async () => shownImage.evaluate((image) => image.complete && image.naturalWidth > 0).catch(() => false), 15_000),
    'the image shows as a picture for the guest (a signed link to storage)',
  );
  const [download] = await Promise.all([
    guest.waitForEvent('download', { timeout: 15_000 }),
    guestChat.getByRole('button', { name: 'دانلود گزارش فصل.pdf' }).click(),
  ]);
  check(download.suggestedFilename() === 'گزارش فصل.pdf', `the guest downloads it under its Persian name (${download.suggestedFilename()})`);

  // Phase 2: «ارسال تصویر به صورت فایل» is stored with the message.
  await owner.getByTestId('chat-file-input').setInputFiles({ name: 'نقشه.png', mimeType: 'image/png', buffer: PNG });
  preview = owner.getByRole('dialog', { name: 'ارسال پیوست' });
  await preview.getByRole('checkbox', { name: 'ارسال تصویر به صورت فایل' }).click();
  await preview.getByRole('button', { name: 'ارسال', exact: true }).click();
  check(await visible(guestChat.getByRole('button', { name: 'دانلود نقشه.png' }), 15_000), 'a picture sent as a file reaches the guest as a download card');
  check((await guestChat.getByRole('img', { name: 'نقشه.png' }).count()) === 0, '…not as an inline photo');

  /* ------------------------------------------------ M4: a voice note */

  await owner.getByRole('button', { name: 'ضبط پیام صوتی' }).click();
  check(await visible(owner.getByText(/در حال ضبط/)), 'the microphone button starts a recording');
  await owner.waitForTimeout(1_800);
  await owner.getByRole('button', { name: 'ارسال پیام صوتی' }).click();
  const guestVoice = guestChat.getByRole('button', { name: `پخش پیام صوتی ${ownerName}` });
  check(await visible(guestVoice, 15_000), 'the voice note arrives live for the guest');
  check(
    await eventually(async () => ((await guestChat.locator('audio').last().getAttribute('src')) ?? '').startsWith('http'), 15_000),
    'the guest’s player streams the stored recording',
  );
  await guestChat.getByRole('button', { name: `سرعت پیام صوتی ${ownerName}: ۱×` }).click();
  check(await eventually(async () => (await guestChat.locator('audio').last().evaluate((audio) => audio.playbackRate)) === 1.5), 'the speed button plays the recording at ۱٫۵×');

  /* ------------------------------------------------ M4: shared media from the server */

  await guestChat.getByRole('button', { name: `${ownerName} — نمایش جزئیات گفتگو` }).click();
  const details = guest.getByRole('complementary').filter({ hasText: 'فایل‌های مشترک' });
  check(await visible(details.getByText('گزارش فصل.pdf'), 10_000), 'the files tab lists the PDF');
  await details.getByRole('tab', { name: /^تصویر و ویدیو/ }).click();
  check(await visible(details.getByRole('button', { name: 'پیش‌نمایش نمودار.png' })), 'the media tab shows the image');
  await details.getByRole('tab', { name: /^صوت/ }).click();
  check(await visible(details.getByText('پیام صوتی').first()), 'the audio tab lists the voice note');
  await guest.keyboard.press('Escape');

  /* ------------------------------------------------ M4: تبدیل پیام به وظیفه */

  const helloFor = (thread) => bubbleOf(thread, hello);
  await helloFor(guestChat).hover();
  await helloFor(guestChat).getByRole('button', { name: 'تبدیل به وظیفه' }).click();
  dialog = guest.getByRole('dialog', { name: 'تبدیل پیام به وظیفه' });
  check(await visible(dialog), 'converting a message opens the task composer, pre-filled');
  await dialog.getByRole('button', { name: 'ایجاد وظیفه از پیام' }).click();
  check(await visible(helloFor(guestChat).getByRole('button', { name: 'مشاهده وظیفه مرتبط' }), 15_000), 'the converted message carries a linked-task chip');
  check(await visible(helloFor(ownerThread).getByRole('button', { name: 'مشاهده وظیفه مرتبط' }), 15_000), 'the chip appears live for the owner');

  // The task's «پیام مبدأ» leads back to the message, highlighted.
  const guestSource = guest.getByRole('region', { name: 'پیام مبدأ' });
  check(await visible(guestSource.getByText(hello), 10_000), 'the new task names its source message');
  await guestSource.getByRole('button', { name: 'نمایش پیام در گفتگو' }).click();
  check(await eventually(async () => ((await guestChat.locator('[data-highlighted="true"]').textContent()) ?? '').includes(hello), 10_000), '«نمایش پیام در گفتگو» highlights the message');

  await helloFor(ownerThread).getByRole('button', { name: 'مشاهده وظیفه مرتبط' }).click();
  const ownerSource = owner.getByRole('region', { name: 'پیام مبدأ' });
  check(await visible(ownerSource.getByText(hello), 10_000), 'the owner opens the task from the chip, with its source');

  /* ------------------------------------------------ M4: subtask order and task files, stored */

  const subtaskBox = owner.getByRole('textbox', { name: 'افزودن زیروظیفه' });
  for (const title of ['اول', 'دوم', 'سوم']) {
    await subtaskBox.fill(title);
    await subtaskBox.press('Enter');
  }
  const handles = (page) => page.getByRole('button', { name: /^جابه‌جایی «/ });
  const order = async (page) => (await handles(page).evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''))).map((label) => label.split('«')[1]?.split('»')[0]);
  check(await eventually(async () => JSON.stringify(await order(owner)) === JSON.stringify(['اول', 'دوم', 'سوم']), 10_000), 'three subtasks added');
  // Wait for the server's ids (the rows are re-read after each add), then move «سوم» to the top.
  await owner.waitForTimeout(1_000);
  await owner.getByRole('button', { name: 'انتقال «سوم» به بالا' }).click();
  await owner.waitForTimeout(400);
  await owner.getByRole('button', { name: 'انتقال «سوم» به بالا' }).click();
  check(await eventually(async () => JSON.stringify(await order(owner)) === JSON.stringify(['سوم', 'اول', 'دوم'])), 'the subtask moves to the top');
  await owner.getByTestId('task-file-input').setInputFiles({ name: 'پیوست وظیفه.pdf', mimeType: 'application/pdf', buffer: PDF });
  check(await visible(owner.getByText('پیوست وظیفه.pdf')), 'a file attaches to the task');
  await owner.waitForTimeout(1_500);
  await owner.reload();
  await helloFor(ownerThread).getByRole('button', { name: 'مشاهده وظیفه مرتبط' }).click({ timeout: 20_000 });
  check(await eventually(async () => JSON.stringify(await order(owner)) === JSON.stringify(['سوم', 'اول', 'دوم']), 10_000), 'the order is stored: the same after a reload');
  check(await visible(owner.getByText('پیوست وظیفه.pdf'), 10_000), 'the task’s file is stored: still attached after a reload');
  await helloFor(guestChat).getByRole('button', { name: 'مشاهده وظیفه مرتبط' }).click();
  check(await eventually(async () => JSON.stringify(await order(guest)) === JSON.stringify(['سوم', 'اول', 'دوم']), 10_000), 'the guest sees the same order');
  await guest.keyboard.press('Escape');
  await owner.keyboard.press('Escape');
  await owner.screenshot({ path: `${out}/live_m4.png` });

  /* ------------------------------------------------ notifications: quick views and mark all read */

  await railOf(guest).getByRole('button', { name: /^اعلان‌ها/ }).click();
  const drawer = guest.getByRole('dialog', { name: 'اعلان‌ها' });
  check(await visible(drawer), 'the guest opens the notification centre');
  const cards = drawer.getByRole('listitem');
  await drawer.getByRole('button', { name: /^وظایف ارجاع‌شده امروز/ }).click();
  check(await eventually(async () => (await cards.filter({ hasText: taskTitle }).count()) === 1, 10_000), '«وظایف ارجاع‌شده امروز» lists the assignment');
  await drawer.getByRole('button', { name: /^پیام‌های اشاره‌شده/ }).click();
  check((await drawer.getByRole('button', { name: /^پیام‌های اشاره‌شده/ }).getAttribute('aria-pressed')) === 'true', '«پیام‌های اشاره‌شده» switches the view');
  await drawer.getByRole('tab', { name: /خوانده‌نشده/ }).click();
  check(await eventually(async () => (await cards.count()) >= 1), 'the unread tab lists the new notifications');
  await drawer.getByRole('button', { name: 'علامت‌گذاری همه به‌عنوان خوانده‌شده' }).click();
  check(await visible(drawer.getByText('همه اعلان‌ها را خوانده‌اید')), '«علامت‌گذاری همه به‌عنوان خوانده‌شده» empties the unread tab');
  await guest.keyboard.press('Escape');
  await guest.waitForTimeout(500);
  await guest.reload();
  await railOf(guest).waitFor({ timeout: 20_000 });
  check(
    await eventually(async () => !(await railOf(guest).getByRole('button', { name: /^اعلان‌ها/ }).getAttribute('aria-label')).includes('خوانده‌نشده'), 10_000),
    'the read state is stored: no unread badge after a reload',
  );

  /* ------------------------------------------------ Phase 3.2: the guest's out-of-office auto-reply */

  const openHours = async (page) => {
    await railOf(page).getByRole('button', { name: /حساب کاربری/ }).click();
    await page.getByRole('menuitem', { name: 'ساعات کاری و پاسخ خودکار' }).click();
    const settings = page.getByRole('dialog', { name: 'ساعات کاری و پاسخ خودکار' });
    await settings.waitFor();
    return settings;
  };
  let hours = await openHours(guest);
  await hours.getByRole('switch', { name: 'پاسخ خودکار خارج از ساعت کاری' }).click();
  // No working days at all: away all week.
  for (const day of ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه']) await hours.getByRole('button', { name: day, exact: true }).click();
  const awayText = `در مرخصی هستم؛ ${runId}`;
  await hours.getByLabel('متن پاسخ خودکار').fill(awayText);
  await hours.getByRole('button', { name: 'ذخیره' }).click();
  await hours.waitFor({ state: 'detached' });
  await guest.reload();
  hours = await openHours(guest);
  check(
    await eventually(async () => (await hours.getByRole('switch', { name: 'پاسخ خودکار خارج از ساعت کاری' }).getAttribute('aria-checked')) === 'true', 10_000),
    'the guest’s auto-reply is stored on the server: on after a reload',
  );
  check((await hours.getByLabel('متن پاسخ خودکار').inputValue()) === awayText, '…with their text');
  await guest.keyboard.press('Escape');

  await railOf(owner).getByRole('link', { name: 'گفتگوها' }).click();
  await owner.waitForURL('**/chats');
  await owner.getByRole('button', { name: new RegExp(guestName) }).first().click();
  const awayComposer = owner.getByRole('textbox', { name: `نوشتن پیام در ${guestName}` });
  await awayComposer.fill('فردا جلسه داریم؟');
  await awayComposer.press('Enter');
  const autoReplies = ownerThread.locator('div.group\\/message').filter({ hasText: 'پاسخ خودکار' });
  check(await eventually(async () => (await autoReplies.count()) === 1, 15_000), 'a direct message to the away guest gets their auto-reply, from the server');
  check(await visible(autoReplies.getByText(awayText)), '…with their text, under their name');
  await awayComposer.fill('باشد، بعداً هماهنگ می‌کنیم.');
  await awayComposer.press('Enter');
  await owner.waitForTimeout(1_500);
  check((await autoReplies.count()) === 1, 'a second message the same day gets no second answer');
  await owner.screenshot({ path: `${out}/live_autoreply.png` });

  /* ------------------------------------------------ Phase 3.2: scheduled messages */

  const scheduleIn = async (text, pick) => {
    await awayComposer.fill(text);
    await ownerThread.getByRole('button', { name: 'زمان‌بندی ارسال' }).click();
    const scheduler = owner.getByRole('dialog', { name: 'زمان‌بندی ارسال پیام' });
    await pick(scheduler);
    await scheduler.getByRole('button', { name: 'زمان‌بندی ارسال' }).click();
    await scheduler.waitFor({ state: 'detached' });
  };
  // One goes out by itself, through the server's worker: two minutes ahead (the scheduler's
  // default day is the day an hour from now; within the last hour before midnight that is
  // tomorrow, so the timed send is left to the other runs).
  const timed = `پیام خودکار سر وقت ${runId}`;
  const soon = new Date(Date.now() + 2 * 60_000);
  const timedToday = new Date(Date.now() + 65 * 60_000).getDate() === soon.getDate();
  if (timedToday) {
    await scheduleIn(timed, async (scheduler) => {
      await scheduler.getByLabel('ساعت ارسال').fill(`${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`);
    });
  }
  const now1 = `ارسال فوری ${