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
 * Covers: sign-up by SMS code â†’ first workspace â†’ project â†’ invitation by SMS â†’ the invitee
 * joins through the link â†’ a task created, assigned and completed by one person appears and
 * moves live for the other â†’ a direct chat with live delivery, typing, read receipts and
 * reactions (â¤ï¸, ðŸ‘Ž) â†’ notification quick views and "mark all read" persisted â†’ the profile
 * menu signs out and the session stays gone after a reload. M4 adds files and images sent in the
 * chat (live, previewed, downloaded under their Persian names), a voice note from the microphone,
 * the shared-media tabs, Â«ØªØ¨Ø¯ÛŒÙ„ Ù¾ÛŒØ§Ù… Ø¨Ù‡ ÙˆØ¸ÛŒÙÙ‡Â» with its chip and the task's Â«Ù¾ÛŒØ§Ù… Ù…Ø¨Ø¯Ø£Â» link,
 * subtask reordering, task attachments and a workspace icon. Phase 2 adds a message whose
 * acknowledgement is lost (marked unsent, then sent again once with the same client id), files
 * waiting in a preview, a picture sent as a file, voice-note speed, notes that reach the server
 * only with their first words, and the free plan's project limit. Any console error or warning â€”
 * hydration mismatches included â€” fails the run.
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

const OTP = /"text":"Ú©Ø¯ ÙˆØ±ÙˆØ¯ Ø´Ù…Ø§ Ø¨Ù‡ ØªØ³Ú©â€ŒØ¯ÙˆÙ†: (\d{6})"/g;
const INVITE = /"text":"[^"]*?(https?:\/\/[^"\s]+\/invite\?token=[^"\s]+)"/g;
const runId = String(Date.now()).slice(-4);
const phoneOf = () => `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const ownerPhone = phoneOf();
let guestPhone = phoneOf();
while (guestPhone === ownerPhone) guestPhone = phoneOf();
const ownerName = `Ø³Ø­Ø± Ø¢Ø²Ù…ÙˆÙ† ${runId}`;
const guestName = `Ø¹Ù„ÛŒ Ø¢Ø²Ù…ÙˆÙ† ${runId}`;
const workspaceName = `ÙØ¶Ø§ÛŒ Ø¢Ø²Ù…ÙˆÙ† ${runId}`;
const projectName = 'Ø¨Ø§Ø²Ø·Ø±Ø§Ø­ÛŒ Ø§Ù¾Ù„ÛŒÚ©ÛŒØ´Ù†';
const taskTitle = `Ø¨Ø§Ø²Ø¨ÛŒÙ†ÛŒ Ø¬Ø±ÛŒØ§Ù† ÙˆØ±ÙˆØ¯ ${runId}`;

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
  throw new Error(`No ${what} in ${apiLog} within 20 s.`);
}

/** Phone â†’ code â†’ (new accounts) name. */
async function signIn(page, phone, fullName) {
  const phoneBox = page.getByRole('textbox', { name: 'Ø´Ù…Ø§Ø±Ù‡ Ù…ÙˆØ¨Ø§ÛŒÙ„' });
  await phoneBox.waitFor({ timeout: 30_000 });
  await phoneBox.fill(phone);
  const from = logSize();
  await page.getByRole('button', { name: 'Ø¯Ø±ÛŒØ§ÙØª Ú©Ø¯ ÙˆØ±ÙˆØ¯' }).click();
  const code = await smsAfter(from, OTP, 'sign-in code');
  await page.getByRole('textbox', { name: 'Ú©Ø¯ ÙˆØ±ÙˆØ¯' }).fill(code);
  await page.getByRole('button', { name: 'ÙˆØ±ÙˆØ¯', exact: true }).click();
  const nameBox = page.getByRole('textbox', { name: 'Ù†Ø§Ù… Ùˆ Ù†Ø§Ù… Ø®Ø§Ù†ÙˆØ§Ø¯Ú¯ÛŒ' });
  await nameBox.waitFor({ timeout: 15_000 });
  await nameBox.fill(fullName);
  await page.getByRole('button', { name: 'Ø³Ø§Ø®Øª Ø­Ø³Ø§Ø¨ Ùˆ ÙˆØ±ÙˆØ¯' }).click();
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
const railOf = (page) => page.getByRole('navigation', { name: 'Ù†Ø§ÙˆØ¨Ø±ÛŒ Ø§ØµÙ„ÛŒ' });
const quickCreate = async (page, item) => {
  await railOf(page).getByRole('button', { name: 'Ø§ÛŒØ¬Ø§Ø¯ Ø³Ø±ÛŒØ¹' }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

try {
  /* ------------------------------------------------ owner: sign-up and first workspace */

  await owner.goto(`${base}/feed`);
  check(await visible(owner.getByRole('heading', { name: 'ÙˆØ±ÙˆØ¯ Ø¨Ù‡ ØªØ³Ú©â€ŒØ¯ÙˆÙ†' }), 30_000), 'signed out: the sign-in screen replaces the workspace');
  check((await owner.locator('html').getAttribute('dir')) === 'rtl', 'the document is right-to-left');
  await signIn(owner, ownerPhone, ownerName);
  check(await visible(owner.getByRole('heading', { name: `${ownerName}ØŒ Ø®ÙˆØ´ Ø¢Ù…Ø¯ÛŒØ¯` }), 15_000), 'a new account is asked for its first workspace');
  await owner.getByRole('textbox', { name: 'Ù†Ø§Ù… ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ' }).fill(workspaceName);
  await owner.getByLabel('Ø±Ù…Ø² Ù…Ø¯ÛŒØ±').fill('Taskin-2026!');
  await owner.getByRole('button', { name: 'Ø³Ø§Ø®Øª ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ' }).click();
  check(await visible(railOf(owner), 20_000), 'the workspace loads after it is created');
  check(await visible(owner.getByText(workspaceName).first()), `the new workspace Â«${workspaceName}Â» is the active one`);
  const font = await owner.evaluate(() => getComputedStyle(document.body).fontFamily);
  check(font.includes('IRANYekanX'), `IRANYekanX is the body font (${font})`);

  /* ------------------------------------------------ owner: a project, then an invitation */

  await quickCreate(owner, 'Ù¾Ø±ÙˆÚ˜Ù‡ Ø¬Ø¯ÛŒØ¯');
  let dialog = owner.getByRole('dialog', { name: 'Ù¾Ø±ÙˆÚ˜Ù‡ Ø¬Ø¯ÛŒØ¯' });
  await dialog.getByLabel('Ù†Ø§Ù… Ù¾Ø±ÙˆÚ˜Ù‡').fill(projectName);
  check((await dialog.getByLabel('Ú©Ù„ÛŒØ¯ Ù¾Ø±ÙˆÚ˜Ù‡').inputValue()) === 'P1', 'a Persian project name gets the key P1');
  await dialog.getByRole('button', { name: 'Ø§ÛŒØ¬Ø§Ø¯ Ù¾Ø±ÙˆÚ˜Ù‡' }).click();
  await owner.waitForURL('**/tasks');
  const tree = owner.getByRole('navigation', { name: 'Ø¯Ø±Ø®Øª Ù¾Ø±ÙˆÚ˜Ù‡â€ŒÙ‡Ø§' });
  // Anchored: the owner's rows also carry a Â«Ø­Ø°Ù Ù¾Ø±ÙˆÚ˜Ù‡ â€¦Â» button (Phase 3.1).
  check(await visible(tree.getByRole('button', { name: new RegExp(`^${projectName}`) })), 'the project appears in the project tree');

  await quickCreate(owner, 'Ø¯Ø¹ÙˆØª Ù‡Ù…Ú©Ø§Ø±');
  dialog = owner.getByRole('dialog', { name: 'Ø¯Ø¹ÙˆØª Ù‡Ù…Ú©Ø§Ø±' });
  const addresses = dialog.getByLabel('Ø§ÛŒÙ…ÛŒÙ„ ÛŒØ§ Ø´Ù…Ø§Ø±Ù‡ Ù…ÙˆØ¨Ø§ÛŒÙ„ Ù‡Ù…Ú©Ø§Ø±Ø§Ù†');
  await addresses.fill(guestPhone);
  await addresses.press('Enter');
  const beforeInvite = logSize();
  await dialog.getByRole('button', { name: 'Ø§Ø±Ø³Ø§Ù„ Ø¯Ø¹ÙˆØªâ€ŒÙ†Ø§Ù…Ù‡' }).click();
  const link = await smsAfter(beforeInvite, INVITE, 'invitation link');
  check(link.includes('/invite?token='), 'the invitation SMS carries a join link');

  /* ------------------------------------------------ guest: joins through the link */

  const invite = new URL(link);
  await guest.goto(`${base}${invite.pathname}${invite.search}`);
  check(await visible(guest.getByRole('heading', { name: 'Ù¾ÛŒÙˆØ³ØªÙ† Ø¨Ù‡ ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ' }), 30_000), 'the invitation link asks the guest to sign in to join');
  await signIn(guest, guestPhone, guestName);
  await guest.waitForURL('**/feed', { timeout: 20_000 });
  check(await visible(railOf(guest), 20_000), 'the guest lands on the desk');
  check(await visible(guest.getByText(workspaceName).first()), 'the guest is in the inviting workspace');

  /* ------------------------------------------------ tasks: created by one, seen live by the other */

  await railOf(guest).getByRole('link', { name: 'Ù¾Ø±ÙˆÚ˜Ù‡â€ŒÙ‡Ø§ Ùˆ ÙˆØ¸Ø§ÛŒÙ' }).click();
  await guest.waitForURL('**/tasks');
  check(await eventually(async () => (await guest.getByRole('navigation', { name: 'Ø¯Ø±Ø®Øª Ù¾Ø±ÙˆÚ˜Ù‡â€ŒÙ‡Ø§' }).getByRole('button', { name: new RegExp(projectName) }).count()) === 1, 10_000), 'the guest sees the project');

  await quickCreate(owner, 'ÙˆØ¸ÛŒÙÙ‡ Ø¬Ø¯ÛŒØ¯');
  dialog = owner.getByRole('dialog', { name: 'ØªØ¹Ø±ÛŒÙ ÙˆØ¸ÛŒÙÙ‡ Ø¬Ø¯ÛŒØ¯' });
  await dialog.getByLabel('Ø¹Ù†ÙˆØ§Ù† ÙˆØ¸ÛŒÙÙ‡').fill(taskTitle);
  check(await eventually(async () => (await dialog.getByRole('checkbox', { name: guestName }).count()) === 1, 10_000), 'the owner can assign the new member');
  await dialog.getByRole('checkbox', { name: guestName }).click();
  await dialog.getByRole('button', { name: 'Ø§ÛŒØ¬Ø§Ø¯ ÙˆØ¸ÛŒÙÙ‡' }).click();
  const ownerCard = owner.getByRole('group', { name: new RegExp(taskTitle) });
  check(await visible(ownerCard), 'the task appears on the ownerâ€™s board');
  // A new task opens in the (modal) task dialog; close it to get back to the board.
  await owner.keyboard.press('Escape');

  const guestCard = guest.getByRole('group', { name: new RegExp(taskTitle) });
  check(await visible(guestCard, 10_000), 'the task appears live on the guestâ€™s board');

  await owner.getByRole('checkbox', { name: `Ø§Ù†Ø¬Ø§Ù… Ø´Ø¯: ${taskTitle}` }).click();
  const guestDone = guest.getByRole('region', { name: 'Ø³ØªÙˆÙ† Ø§Ù†Ø¬Ø§Ù… Ø´Ø¯' });
  check(await eventually(async () => (await guestDone.getByRole('group', { name: new RegExp(taskTitle) }).count()) === 1, 10_000), 'completing it moves it to Â«Ø§Ù†Ø¬Ø§Ù… Ø´Ø¯Â» live for the guest');
  await owner.reload();
  check(await eventually(async () => (await owner.getByRole('region', { name: 'Ø³ØªÙˆÙ† Ø§Ù†Ø¬Ø§Ù… Ø´Ø¯' }).getByRole('group', { name: new RegExp(taskTitle) }).count()) === 1, 15_000), 'the completion is stored: still done after a reload');
  await owner.screenshot({ path: `${out}/live_board.png` });

  /* ------------------------------------------------ chat: live delivery, typing, receipts, reactions */

  await quickCreate(owner, 'Ú¯ÙØªÚ¯ÙˆÛŒ Ø¬Ø¯ÛŒØ¯');
  dialog = owner.getByRole('dialog', { name: 'Ú¯ÙØªÚ¯ÙˆÛŒ Ø¬Ø¯ÛŒØ¯' });
  await dialog.getByRole('radio', { name: new RegExp(guestName) }).click();
  await dialog.getByRole('button', { name: 'Ø´Ø±ÙˆØ¹ Ú¯ÙØªÚ¯Ùˆ' }).click();
  await owner.waitForURL('**/chats');
  const ownerThread = owner.getByRole('region', { name: `Ú¯ÙØªÚ¯ÙˆÛŒ ${guestName}` });
  check(await visible(ownerThread, 10_000), 'the direct chat opens for the owner');
  // Phase 3.1: the project opened its own channel with it, its creator in it.
  check(await visible(owner.getByRole('button', { name: new RegExp(projectName) }).first(), 10_000), 'the projectâ€™s own channel is in the ownerâ€™s chat list');
  const hello = `Ø³Ù„Ø§Ù… ${guestName}ØŒ Ø¨ÙˆØ±Ø¯ Ø±Ø§ Ø¨Ø¨ÛŒÙ†.`;
  const ownerComposer = owner.getByRole('textbox', { name: `Ù†ÙˆØ´ØªÙ† Ù¾ÛŒØ§Ù… Ø¯Ø± ${guestName}` });
  await ownerComposer.fill(hello);
  await ownerComposer.press('Enter');
  check(await visible(ownerThread.getByText(hello)), 'the ownerâ€™s message shows at once');

  await railOf(guest).getByRole('link', { name: 'Ú¯ÙØªÚ¯ÙˆÙ‡Ø§' }).click();
  await guest.waitForURL('**/chats');
  const guestEntry = guest.getByRole('button', { name: new RegExp(ownerName) }).first();
  check(await visible(guestEntry, 10_000), 'the new chat appears live in the guestâ€™s list');
  check((await guest.getByRole('button', { name: new RegExp(projectName) }).count()) === 0, 'the projectâ€™s channel is its membersâ€™ only: not in the guestâ€™s list');
  await guestEntry.click();
  const guestThread = guest.getByRole('region', { name: `Ú¯ÙØªÚ¯ÙˆÛŒ ${ownerName}` });
  check(await visible(guestThread.getByText(hello), 10_000), 'the guest receives the message');
  check(await eventually(async () => (await ownerThread.getByRole('img', { name: 'Ø®ÙˆØ§Ù†Ø¯Ù‡ Ø´Ø¯' }).count()) >= 1, 10_000), 'the owner sees the read receipt');

  const guestComposer = guest.getByRole('textbox', { name: `Ù†ÙˆØ´ØªÙ† Ù¾ÛŒØ§Ù… Ø¯Ø± ${ownerName}` });
  await guestComposer.pressSequentially('Ø¯Ø§Ø±Ù… Ù…ÛŒâ€ŒÙ†ÙˆÛŒØ³Ù…', { delay: 30 });
  check(await eventually(async () => ((await owner.getByTestId('typing-indicator').textContent()) ?? '').includes(`${guestName} Ø¯Ø± Ø­Ø§Ù„ Ù†ÙˆØ´ØªÙ† Ø§Ø³Øª`), 10_000), 'the owner sees the guest typing');
  await guestComposer.fill('Ø¯ÛŒØ¯Ù…ØŒ Ù…Ù…Ù†ÙˆÙ†!');
  await guestComposer.press('Enter');
  check(await visible(ownerThread.getByText('Ø¯ÛŒØ¯Ù…ØŒ Ù…Ù…Ù†ÙˆÙ†!'), 10_000), 'the owner receives the reply live');
  check(await eventually(async () => ((await owner.getByTestId('typing-indicator').textContent()) ?? '') === '', 10_000), 'the typing line clears after the reply');

  const bubbleOf = (thread, text) => thread.locator('div.group\\/message').filter({ hasText: text }).last();
  const react = async (page, thread, text, label) => {
    const bubble = bubbleOf(thread, text);
    await bubble.hover();
    await bubble.getByRole('button', { name: 'Ø§Ù‚Ø¯Ø§Ù…â€ŒÙ‡Ø§ÛŒ Ø¨ÛŒØ´ØªØ±' }).click();
    await page.getByRole('group', { name: 'ÙˆØ§Ú©Ù†Ø´ Ø³Ø±ÛŒØ¹' }).getByRole('button', { name: label }).click();
  };
  await react(guest, guestThread, hello, 'ÙˆØ§Ú©Ù†Ø´ Ù‚Ù„Ø¨');
  check(await eventually(async () => (await ownerThread.getByRole('button', { name: 'â¤ï¸ â€” Û± Ù†ÙØ±' }).count()) === 1, 10_000), 'â¤ï¸ from the guest shows live for the owner');
  await react(guest, guestThread, hello, 'ÙˆØ§Ú©Ù†Ø´ Ù†Ù¾Ø³Ù†Ø¯ÛŒØ¯Ù…');
  check(await eventually(async () => (await ownerThread.getByRole('button', { name: 'ðŸ‘Ž â€” Û± Ù†ÙØ±' }).count()) === 1, 10_000), 'ðŸ‘Ž from the guest shows live for the owner');
  await guestThread.getByRole('button', { name: 'ðŸ‘Ž â€” Û± Ù†ÙØ±' }).click();
  check(await eventually(async () => (await ownerThread.getByRole('button', { name: /^ðŸ‘Ž/ }).count()) === 0, 10_000), 'toggling ðŸ‘Ž off removes it for the owner');
  await guest.reload();
  await guestEntry.click();
  check(await eventually(async () => (await guest.getByRole('region', { name: `Ú¯ÙØªÚ¯ÙˆÛŒ ${ownerName}` }).getByRole('button', { name: 'â¤ï¸ â€” Û± Ù†ÙØ±' }).count()) === 1, 15_000), 'the â¤ï¸ is stored: still there after a reload');
  await owner.screenshot({ path: `${out}/live_chat.png` });

  /* ------------------------------------------------ Phase 2: an unsent message, sent again once */

  // The owner's socket now runs through a relay that can lose one send's acknowledgement: the API
  // stores the message, but the owner's app hears nothing back, times out and marks its copy
  // unsent. Â«Ø§Ø±Ø³Ø§Ù„ Ø¯ÙˆØ¨Ø§Ø±Ù‡Â» repeats the send with its first client id, so the guest has it once.
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
  check(await eventually(() => relayed, 20_000), 'the ownerâ€™s socket reconnects through the relay');
  const unsent = `Ù¾ÛŒØ§Ù…ÛŒ Ú©Ù‡ Ù¾Ø§Ø³Ø®Ø´ Ú¯Ù… Ø´Ø¯ ${runId}`;
  loseNextAck = true;
  await ownerComposer.fill(unsent);
  await ownerComposer.press('Enter');
  check(await visible(guestThread.getByText(unsent), 10_000), 'the API stores the message: the guest has it');
  const unsentRow = ownerThread.getByRole('group', { name: 'Ù¾ÛŒØ§Ù… Ø§Ø±Ø³Ø§Ù„ Ù†Ø´Ø¯' });
  check(await visible(unsentRow, 20_000), 'with no acknowledgement the ownerâ€™s copy is marked Â«Ø§Ø±Ø³Ø§Ù„ Ù†Ø´Ø¯Â», with Â«Ø§Ø±Ø³Ø§Ù„ Ø¯ÙˆØ¨Ø§Ø±Ù‡Â»');
  await owner.screenshot({ path: `${out}/live_unsent.png` });
  await unsentRow.getByRole('button', { name: 'Ø§Ø±Ø³Ø§Ù„ Ø¯ÙˆØ¨Ø§Ø±Ù‡' }).click();
  check(await eventually(async () => (await unsentRow.count()) === 0, 10_000), 'Â«Ø§Ø±Ø³Ø§Ù„ Ø¯ÙˆØ¨Ø§Ø±Ù‡Â» goes through');
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
  const guestChat = guest.getByRole('region', { name: `Ú¯ÙØªÚ¯ÙˆÛŒ ${ownerName}` });
  await owner.getByTestId('chat-file-input').setInputFiles([
    { name: 'Ú¯Ø²Ø§Ø±Ø´ ÙØµÙ„.pdf', mimeType: 'application/pdf', buffer: PDF },
    { name: 'Ù†Ù…ÙˆØ¯Ø§Ø±.png', mimeType: 'image/png', buffer: PNG },
  ]);
  // Picked files wait in the preview (Phase 2) until they are sent.
  let preview = owner.getByRole('dialog', { name: 'Ø§Ø±Ø³Ø§Ù„ Ù¾ÛŒÙˆØ³Øª' });
  await preview.getByRole('button', { name: 'Ø§Ø±Ø³Ø§Ù„', exact: true }).click();
  check(await visible(ownerThread.getByText('Ú¯Ø²Ø§Ø±Ø´ ÙØµÙ„.pdf')), 'a picked file shows in the thread at once');
  check(await visible(guestChat.getByText('Ú¯Ø²Ø§Ø±Ø´ ÙØµÙ„.pdf'), 15_000), 'the file arrives live for the guest');
  const shownImage = guestChat.getByRole('img', { name: 'Ù†Ù…ÙˆØ¯Ø§Ø±.png' });
  check(
    await eventually(async () => shownImage.evaluate((image) => image.complete && image.naturalWidth > 0).catch(() => false), 15_000),
    'the image shows as a picture for the guest (a signed link to storage)',
  );
  const [download] = await Promise.all([
    guest.waitForEvent('download', { timeout: 15_000 }),
    guestChat.getByRole('button', { name: 'Ø¯Ø§Ù†Ù„ÙˆØ¯ Ú¯Ø²Ø§Ø±Ø´ ÙØµÙ„.pdf' }).click(),
  ]);
  check(download.suggestedFilename() === 'Ú¯Ø²Ø§Ø±Ø´ ÙØµÙ„.pdf', `the guest downloads it under its Persian name (${download.suggestedFilename()})`);

  // Phase 2: Â«Ø§Ø±Ø³Ø§Ù„ ØªØµÙˆÛŒØ± Ø¨Ù‡ ØµÙˆØ±Øª ÙØ§ÛŒÙ„Â» is stored with the message.
  await owner.getByTestId('chat-file-input').setInputFiles({ name: 'Ù†Ù‚Ø´Ù‡.png', mimeType: 'image/png', buffer: PNG });
  preview = owner.getByRole('dialog', { name: 'Ø§Ø±Ø³Ø§Ù„ Ù¾ÛŒÙˆØ³Øª' });
  await preview.getByRole('checkbox', { name: 'Ø§Ø±Ø³Ø§Ù„ ØªØµÙˆÛŒØ± Ø¨Ù‡ ØµÙˆØ±Øª ÙØ§ÛŒÙ„' }).click();
  await preview.getByRole('button', { name: 'Ø§Ø±Ø³Ø§Ù„', exact: true }).click();
  check(await visible(guestChat.getByRole('button', { name: 'Ø¯Ø§Ù†Ù„ÙˆØ¯ Ù†Ù‚Ø´Ù‡.png' }), 15_000), 'a picture sent as a file reaches the guest as a download card');
  check((await guestChat.getByRole('img', { name: 'Ù†Ù‚Ø´Ù‡.png' }).count()) === 0, 'â€¦not as an inline photo');

  /* ------------------------------------------------ M4: a voice note */

  await owner.getByRole('button', { name: 'Ø¶Ø¨Ø· Ù¾ÛŒØ§Ù… ØµÙˆØªÛŒ' }).click();
  check(await visible(owner.getByText(/Ø¯Ø± Ø­Ø§Ù„ Ø¶Ø¨Ø·/)), 'the microphone button starts a recording');
  await owner.waitForTimeout(1_800);
  await owner.getByRole('button', { name: 'Ø§Ø±Ø³Ø§Ù„ Ù¾ÛŒØ§Ù… ØµÙˆØªÛŒ' }).click();
  const guestVoice = guestChat.getByRole('button', { name: `Ù¾Ø®Ø´ Ù¾ÛŒØ§Ù… ØµÙˆØªÛŒ ${ownerName}` });
  check(await visible(guestVoice, 15_000), 'the voice note arrives live for the guest');
  check(
    await eventually(async () => ((await guestChat.locator('audio').last().getAttribute('src')) ?? '').startsWith('http'), 15_000),
    'the guestâ€™s player streams the stored recording',
  );
  await guestChat.getByRole('button', { name: `Ø³Ø±Ø¹Øª Ù¾ÛŒØ§Ù… ØµÙˆØªÛŒ ${ownerName}: Û±Ã—` }).click();
  check(await eventually(async () => (await guestChat.locator('audio').last().evaluate((audio) => audio.playbackRate)) === 1.5), 'the speed button plays the recording at Û±Ù«ÛµÃ—');

  /* ------------------------------------------------ M4: shared media from the server */

  await guestChat.getByRole('button', { name: `${ownerName} â€” Ù†Ù…Ø§ÛŒØ´ Ø¬Ø²Ø¦ÛŒØ§Øª Ú¯ÙØªÚ¯Ùˆ` }).click();
  const details = guest.getByRole('complementary').filter({ hasText: 'ÙØ§ÛŒÙ„â€ŒÙ‡Ø§ÛŒ Ù…Ø´ØªØ±Ú©' });
  check(await visible(details.getByText('Ú¯Ø²Ø§Ø±Ø´ ÙØµÙ„.pdf'), 10_000), 'the files tab lists the PDF');
  await details.getByRole('tab', { name: /^ØªØµÙˆÛŒØ± Ùˆ ÙˆÛŒØ¯ÛŒÙˆ/ }).click();
  check(await visible(details.getByRole('button', { name: 'Ù¾ÛŒØ´â€ŒÙ†Ù…Ø§ÛŒØ´ Ù†Ù…ÙˆØ¯Ø§Ø±.png' })), 'the media tab shows the image');
  await details.getByRole('tab', { name: /^ØµÙˆØª/ }).click();
  check(await visible(details.getByText('Ù¾ÛŒØ§Ù… ØµÙˆØªÛŒ').first()), 'the audio tab lists the voice note');
  await guest.keyboard.press('Escape');

  /* ------------------------------------------------ M4: ØªØ¨Ø¯ÛŒÙ„ Ù¾ÛŒØ§Ù… Ø¨Ù‡ ÙˆØ¸ÛŒÙÙ‡ */

  const helloFor = (thread) => bubbleOf(thread, hello);
  await helloFor(guestChat).hover();
  await helloFor(guestChat).getByRole('button', { name: 'ØªØ¨Ø¯ÛŒÙ„ Ø¨Ù‡ ÙˆØ¸ÛŒÙÙ‡' }).click();
  dialog = guest.getByRole('dialog', { name: 'ØªØ¨Ø¯ÛŒÙ„ Ù¾ÛŒØ§Ù… Ø¨Ù‡ ÙˆØ¸ÛŒÙÙ‡' });
  check(await visible(dialog), 'converting a message opens the task composer, pre-filled');
  await dialog.getByRole('button', { name: 'Ø§ÛŒØ¬Ø§Ø¯ ÙˆØ¸ÛŒÙÙ‡ Ø§Ø² Ù¾ÛŒØ§Ù…' }).click();
  check(await visible(helloFor(guestChat).getByRole('button', { name: 'Ù…Ø´Ø§Ù‡Ø¯Ù‡ ÙˆØ¸ÛŒÙÙ‡ Ù…Ø±ØªØ¨Ø·' }), 15_000), 'the converted message carries a linked-task chip');
  check(await visible(helloFor(ownerThread).getByRole('button', { name: 'Ù…Ø´Ø§Ù‡Ø¯Ù‡ ÙˆØ¸ÛŒÙÙ‡ Ù…Ø±ØªØ¨Ø·' }), 15_000), 'the chip appears live for the owner');

  // The task's Â«Ù¾ÛŒØ§Ù… Ù…Ø¨Ø¯Ø£Â» leads back to the message, highlighted.
  const guestSource = guest.getByRole('region', { name: 'Ù¾ÛŒØ§Ù… Ù…Ø¨Ø¯Ø£' });
  check(await visible(guestSource.getByText(hello), 10_000), 'the new task names its source message');
  await guestSource.getByRole('button', { name: 'Ù†Ù…Ø§ÛŒØ´ Ù¾ÛŒØ§Ù… Ø¯Ø± Ú¯ÙØªÚ¯Ùˆ' }).click();
  check(await eventually(async () => ((await guestChat.locator('[data-highlighted="true"]').textContent()) ?? '').includes(hello), 10_000), 'Â«Ù†Ù…Ø§ÛŒØ´ Ù¾ÛŒØ§Ù… Ø¯Ø± Ú¯ÙØªÚ¯ÙˆÂ» highlights the message');

  await helloFor(ownerThread).getByRole('button', { name: 'Ù…Ø´Ø§Ù‡Ø¯Ù‡ ÙˆØ¸ÛŒÙÙ‡ Ù…Ø±ØªØ¨Ø·' }).click();
  const ownerSource = owner.getByRole('region', { name: 'Ù¾ÛŒØ§Ù… Ù…Ø¨Ø¯Ø£' });
  check(await visible(ownerSource.getByText(hello), 10_000), 'the owner opens the task from the chip, with its source');

  /* ------------------------------------------------ M4: subtask order and task files, stored */

  const subtaskBox = owner.getByRole('textbox', { name: 'Ø§ÙØ²ÙˆØ¯Ù† Ø²ÛŒØ±ÙˆØ¸ÛŒÙÙ‡' });
  for (const title of ['Ø§ÙˆÙ„', 'Ø¯ÙˆÙ…', 'Ø³ÙˆÙ…']) {
    await subtaskBox.fill(title);
    await subtaskBox.press('Enter');
  }
  const handles = (page) => page.getByRole('button', { name: /^Ø¬Ø§Ø¨Ù‡â€ŒØ¬Ø§ÛŒÛŒ Â«/ });
  const order = async (page) => (await handles(page).evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''))).map((label) => label.split('Â«')[1]?.split('Â»')[0]);
  check(await eventually(async () => JSON.stringify(await order(owner)) === JSON.stringify(['Ø§ÙˆÙ„', 'Ø¯ÙˆÙ…', 'Ø³ÙˆÙ…']), 10_000), 'three subtasks added');
  // Wait for the server's ids (the rows are re-read after each add), then move Â«Ø³ÙˆÙ…Â» to the top.
  await owner.waitForTimeout(1_000);
  await owner.getByRole('button', { name: 'Ø§Ù†ØªÙ‚Ø§Ù„ Â«Ø³ÙˆÙ…Â» Ø¨Ù‡ Ø¨Ø§Ù„Ø§' }).click();
  await owner.waitForTimeout(400);
  await owner.getByRole('button', { name: 'Ø§Ù†ØªÙ‚Ø§Ù„ Â«Ø³ÙˆÙ…Â» Ø¨Ù‡ Ø¨Ø§Ù„Ø§' }).click();
  check(await eventually(async () => JSON.stringify(await order(owner)) === JSON.stringify(['Ø³ÙˆÙ…', 'Ø§ÙˆÙ„', 'Ø¯ÙˆÙ…'])), 'the subtask moves to the top');
  await owner.getByTestId('task-file-input').setInputFiles({ name: 'Ù¾ÛŒÙˆØ³Øª ÙˆØ¸ÛŒÙÙ‡.pdf', mimeType: 'application/pdf', buffer: PDF });
  check(await visible(owner.getByText('Ù¾ÛŒÙˆØ³Øª ÙˆØ¸ÛŒÙÙ‡.pdf')), 'a file attaches to the task');
  await owner.waitForTimeout(1_500);
  await owner.reload();
  await helloFor(ownerThread).getByRole('button', { name: 'Ù…Ø´Ø§Ù‡Ø¯Ù‡ ÙˆØ¸ÛŒÙÙ‡ Ù…Ø±ØªØ¨Ø·' }).click({ timeout: 20_000 });
  check(await eventually(async () => JSON.stringify(await order(owner)) === JSON.stringify(['Ø³ÙˆÙ…', 'Ø§ÙˆÙ„', 'Ø¯ÙˆÙ…']), 10_000), 'the order is stored: the same after a reload');
  check(await visible(owner.getByText('Ù¾ÛŒÙˆØ³Øª ÙˆØ¸ÛŒÙÙ‡.pdf'), 10_000), 'the taskâ€™s file is stored: still attached after a reload');
  await helloFor(guestChat).getByRole('button', { name: 'Ù…Ø´Ø§Ù‡Ø¯Ù‡ ÙˆØ¸ÛŒÙÙ‡ Ù…Ø±ØªØ¨Ø·' }).click();
  check(await eventually(async () => JSON.stringify(await order(guest)) === JSON.stringify(['Ø³ÙˆÙ…', 'Ø§ÙˆÙ„', 'Ø¯ÙˆÙ…']), 10_000), 'the guest sees the same order');
  await guest.keyboard.press('Escape');
  await owner.keyboard.press('Escape');
  await owner.screenshot({ path: `${out}/live_m4.png` });

  /* ------------------------------------------------ notifications: quick views and mark all read */

  await railOf(guest).getByRole('button', { name: /^Ø§Ø¹Ù„Ø§Ù†â€ŒÙ‡Ø§/ }).click();
  const drawer = guest.getByRole('dialog', { name: 'Ø§Ø¹Ù„Ø§Ù†â€ŒÙ‡Ø§' });
  check(await visible(drawer), 'the guest opens the notification centre');
  const cards = drawer.getByRole('listitem');
  await drawer.getByRole('button', { name: /^ÙˆØ¸Ø§ÛŒÙ Ø§Ø±Ø¬Ø§Ø¹â€ŒØ´Ø¯Ù‡ Ø§Ù…Ø±ÙˆØ²/ }).click();
  check(await eventually(async () => (await cards.filter({ hasText: taskTitle }).count()) === 1, 10_000), 'Â«ÙˆØ¸Ø§ÛŒÙ Ø§Ø±Ø¬Ø§Ø¹â€ŒØ´Ø¯Ù‡ Ø§Ù…Ø±ÙˆØ²Â» lists the assignment');
  await drawer.getByRole('button', { name: /^Ù¾ÛŒØ§Ù…â€ŒÙ‡Ø§ÛŒ Ø§Ø´Ø§Ø±Ù‡â€ŒØ´Ø¯Ù‡/ }).click();
  check((await drawer.getByRole('button', { name: /^Ù¾ÛŒØ§Ù…â€ŒÙ‡Ø§ÛŒ Ø§Ø´Ø§Ø±Ù‡â€ŒØ´Ø¯Ù‡/ }).getAttribute('aria-pressed')) === 'true', 'Â«Ù¾ÛŒØ§Ù…â€ŒÙ‡Ø§ÛŒ Ø§Ø´Ø§Ø±Ù‡â€ŒØ´Ø¯Ù‡Â» switches the view');
  await drawer.getByRole('tab', { name: /Ø®ÙˆØ§Ù†Ø¯Ù‡â€ŒÙ†Ø´Ø¯Ù‡/ }).click();
  check(await eventually(async () => (await cards.count()) >= 1), 'the unread tab lists the new notifications');
  await drawer.getByRole('button', { name: 'Ø¹Ù„Ø§Ù…Øªâ€ŒÚ¯Ø°Ø§Ø±ÛŒ Ù‡Ù…Ù‡ Ø¨Ù‡â€ŒØ¹Ù†ÙˆØ§Ù† Ø®ÙˆØ§Ù†Ø¯Ù‡â€ŒØ´Ø¯Ù‡' }).click();
  check(await visible(drawer.getByText('Ù‡Ù…Ù‡ Ø§Ø¹Ù„Ø§Ù†â€ŒÙ‡Ø§ Ø±Ø§ Ø®ÙˆØ§Ù†Ø¯Ù‡â€ŒØ§ÛŒØ¯')), 'Â«Ø¹Ù„Ø§Ù…Øªâ€ŒÚ¯Ø°Ø§Ø±ÛŒ Ù‡Ù…Ù‡ Ø¨Ù‡â€ŒØ¹Ù†ÙˆØ§Ù† Ø®ÙˆØ§Ù†Ø¯Ù‡â€ŒØ´Ø¯Ù‡Â» empties the unread tab');
  await guest.keyboard.press('Escape');
  await guest.waitForTimeout(500);
  await guest.reload();
  await railOf(guest).waitFor({ timeout: 20_000 });
  check(
    await eventually(async () => !(await railOf(guest).getByRole('button', { name: /^Ø§Ø¹Ù„Ø§Ù†â€ŒÙ‡Ø§/ }).getAttribute('aria-label')).includes('Ø®ÙˆØ§Ù†Ø¯Ù‡â€ŒÙ†Ø´Ø¯Ù‡'), 10_000),
    'the read state is stored: no unread badge after a reload',
  );

  /* ------------------------------------------------ Phase 3.2: the guest's out-of-office auto-reply */

  const openHours = async (page) => {
    await railOf(page).getByRole('button', { name: /Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ/ }).click();
    await page.getByRole('menuitem', { name: 'Ø³Ø§Ø¹Ø§Øª Ú©Ø§Ø±ÛŒ Ùˆ Ù¾Ø§Ø³Ø® Ø®ÙˆØ¯Ú©Ø§Ø±' }).click();
    const settings = page.getByRole('dialog', { name: 'Ø³Ø§Ø¹Ø§Øª Ú©Ø§Ø±ÛŒ Ùˆ Ù¾Ø§Ø³Ø® Ø®ÙˆØ¯Ú©Ø§Ø±' });
    await settings.waitFor();
    return settings;
  };
  let hours = await openHours(guest);
  await hours.getByRole('switch', { name: 'Ù¾Ø§Ø³Ø® Ø®ÙˆØ¯Ú©Ø§Ø± Ø®Ø§Ø±Ø¬ Ø§Ø² Ø³Ø§Ø¹Øª Ú©Ø§Ø±ÛŒ' }).click();
  // No working days at all: away all week.
  for (const day of ['Ø´Ù†Ø¨Ù‡', 'ÛŒÚ©Ø´Ù†Ø¨Ù‡', 'Ø¯ÙˆØ´Ù†Ø¨Ù‡', 'Ø³Ù‡â€ŒØ´Ù†Ø¨Ù‡', 'Ú†Ù‡Ø§Ø±Ø´Ù†Ø¨Ù‡']) await hours.getByRole('button', { name: day, exact: true }).click();
  const awayText = `Ø¯Ø± Ù…Ø±Ø®ØµÛŒ Ù‡Ø³ØªÙ…Ø› ${runId}`;
  await hours.getByLabel('Ù…ØªÙ† Ù¾Ø§Ø³Ø® Ø®ÙˆØ¯Ú©Ø§Ø±').fill(awayText);
  await hours.getByRole('button', { name: 'Ø°Ø®ÛŒØ±Ù‡' }).click();
  await hours.waitFor({ state: 'detached' });
  await guest.reload();
  hours = await openHours(guest);
  check(
    await eventually(async () => (await hours.getByRole('switch', { name: 'Ù¾Ø§Ø³Ø® Ø®ÙˆØ¯Ú©Ø§Ø± Ø®Ø§Ø±Ø¬ Ø§Ø² Ø³Ø§Ø¹Øª Ú©Ø§Ø±ÛŒ' }).getAttribute('aria-checked')) === 'true', 10_000),
    'the guestâ€™s auto-reply is stored on the server: on after a reload',
  );
  check((await hours.getByLabel('Ù…ØªÙ† Ù¾Ø§Ø³Ø® Ø®ÙˆØ¯Ú©Ø§Ø±').inputValue()) === awayText, 'â€¦with their text');
  await guest.keyboard.press('Escape');

  await railOf(owner).getByRole('link', { name: 'Ú¯ÙØªÚ¯ÙˆÙ‡Ø§' }).click();
  await owner.waitForURL('**/chats');
  await owner.getByRole('button', { name: new RegExp(guestName) }).first().click();
  const awayComposer = owner.getByRole('textbox', { name: `Ù†ÙˆØ´ØªÙ† Ù¾ÛŒØ§Ù… Ø¯Ø± ${guestName}` });
  await awayComposer.fill('ÙØ±Ø¯Ø§ Ø¬Ù„Ø³Ù‡ Ø¯Ø§Ø±ÛŒÙ…ØŸ');
  await awayComposer.press('Enter');
  const autoReplies = ownerThread.locator('div.group\\/message').filter({ hasText: 'Ù¾Ø§Ø³Ø® Ø®ÙˆØ¯Ú©Ø§Ø±' });
  check(await eventually(async () => (await autoReplies.count()) === 1, 15_000), 'a direct message to the away guest gets their auto-reply, from the server');
  check(await visible(autoReplies.getByText(awayText)), 'â€¦with their text, under their name');
  await awayComposer.fill('Ø¨Ø§Ø´Ø¯ØŒ Ø¨Ø¹Ø¯Ø§Ù‹ Ù‡Ù…Ø§Ù‡Ù†Ú¯ Ù…ÛŒâ€ŒÚ©Ù†ÛŒÙ….');
  await awayComposer.press('Enter');
  await owner.waitForTimeout(1_500);
  check((await autoReplies.count()) === 1, 'a second message the same day gets no second answer');
  await owner.screenshot({ path: `${out}/live_autoreply.png` });

  /* ------------------------------------------------ Phase 3.2: scheduled messages */

  const scheduleIn = async (text, pick) => {
    await awayComposer.fill(text);
    await ownerThread.getByRole('button', { name: 'Ø²Ù…Ø§Ù†â€ŒØ¨Ù†Ø¯ÛŒ Ø§Ø±Ø³Ø§Ù„' }).click();
    const scheduler = owner.getByRole('dialog', { name: 'Ø²Ù…Ø§Ù†â€ŒØ¨Ù†Ø¯ÛŒ Ø§Ø±Ø³Ø§Ù„ Ù¾ÛŒØ§Ù…' });
    await pick(scheduler);
    await scheduler.getByRole('button', { name: 'Ø²Ù…Ø§Ù†â€ŒØ¨Ù†Ø¯ÛŒ Ø§Ø±Ø³Ø§Ù„' }).click();
    await scheduler.waitFor({ state: 'detached' });
  };
  // One goes out by itself, through the server's worker: two minutes ahead (the scheduler's
  // default day is the day an hour from now; within the last hour before midnight that is
  // tomorrow, so the timed send is left to the other runs).
  const timed = `Ù¾ÛŒØ§Ù… Ø®ÙˆØ¯Ú©Ø§Ø± Ø³Ø± ÙˆÙ‚Øª ${runId}`;
  const soon = new Date(Date.now() + 2 * 60_000);
  const timedToday = new Date(Date.now() + 65 * 60_000).getDate() === soon.getDate();
  if (timedToday) {
    await scheduleIn(timed, async (scheduler) => {
      await scheduler.getByLabel('Ø³Ø§Ø¹Øª Ø§Ø±Ø³Ø§Ù„').fill(`${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`);
    });
  }
  const now1 = `Ø§Ø±Ø³Ø§Ù„ ÙÙˆØ±ÛŒ ${runId}`;
  const dropped = `Ù„ØºÙˆØ´Ø¯Ù‡ ${runId}`;
  await scheduleIn(now1, (scheduler) => scheduler.getByRole('button', { name: /^ÙØ±Ø¯Ø§ Ø³Ø§Ø¹Øª/ }).click());
  await scheduleIn(dropped, (scheduler) => scheduler.getByRole('button', { name: /^ÙØ±Ø¯Ø§ Ø³Ø§Ø¹Øª/ }).click());
  const waitingBar = ownerThread.getByRole('button', { name: /Ù¾ÛŒØ§Ù…â€ŒÙ‡Ø§ÛŒ Ø²Ù…Ø§Ù†â€ŒØ¨Ù†Ø¯ÛŒâ€ŒØ´Ø¯Ù‡/ });
  check(await visible(waitingBar), 'the ownerâ€™s scheduled messages wait above the composer');
  check((await ownerThread.getByText(now1).count()) === 0, 'â€¦and are not in the thread');
  await owner.reload();
  await owner.getByRole('button', { name: new RegExp(guestName) }).first().click({ timeout: 20_000 });
  check(await visible(waitingBar, 20_000), 'they are stored on the server: still waiting after a reload');
  await railOf(guest).getByRole('link', { name: 'Ú¯ÙØªÚ¯ÙˆÙ‡Ø§' }).click();
  await guest.waitForURL('**/chats');
  await guest.getByRole('button', { name: new RegExp(ownerName) }).first().click();
  check(await visible(guestThread, 10_000), 'the guest has the direct chat open');
  check((await guestThread.getByText(now1).count()) === 0, 'the guest does not see them before they are sent');

  await waitingBar.click();
  const waitingList = owner.getByRole('dialog', { name: 'Ù¾ÛŒØ§Ù…â€ŒÙ‡Ø§ÛŒ Ø²Ù…Ø§Ù†â€ŒØ¨Ù†Ø¯ÛŒâ€ŒØ´Ø¯Ù‡' });
  const waitingItems = waitingList.getByRole('listitem');
  check(await eventually(async () => (await waitingItems.count()) === (timedToday ? 3 : 2), 10_000), 'the list holds each of them');
  await waitingItems.filter({ hasText: now1 }).getByRole('button', { name: 'Ø§Ø±Ø³Ø§Ù„ ÙÙˆØ±ÛŒ' }).click();
  check(await visible(guestThread.getByText(now1), 15_000), 'Â«Ø§Ø±Ø³Ø§Ù„ ÙÙˆØ±ÛŒÂ»: the guest receives it live');
  check(await visible(ownerThread.getByText(now1), 10_000), 'â€¦and it is in the ownerâ€™s thread');
  await waitingItems.filter({ hasText: dropped }).getByRole('button', { name: 'Ù„ØºÙˆ / Ø­Ø°Ù' }).click();
  check(await eventually(async () => (await waitingItems.filter({ hasText: dropped }).count()) === 0, 10_000), 'Â«Ù„ØºÙˆ / Ø­Ø°ÙÂ» takes it off the list');
  await owner.keyboard.press('Escape');
  if (timedToday) {
    check(await visible(guestThread.getByText(timed), 180_000), 'at its time the worker sends it: the guest receives it live');
    check(await eventually(async () => (await waitingBar.count()) === 0, 15_000), 'â€¦and the ownerâ€™s list is empty');
  }
  check((await guestThread.getByText(dropped).count()) === 0 && (await ownerThread.getByText(dropped).count()) === 0, 'the cancelled one is never sent');
  check((await autoReplies.count()) === 1, 'scheduled messages to the away guest do not set off another answer the same day');
  await owner.screenshot({ path: `${out}/live_scheduled.png` });

  /* ------------------------------------------------ profile menu: sign out clears the session */

  await railOf(guest).getByRole('button', { name: /Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ/ }).click();
  await guest.getByRole('menuitem', { name: 'Ù¾Ø±ÙˆÙØ§ÛŒÙ„ Ù…Ù†' }).click();
  check(await visible(guest.getByRole('dialog', { name: 'Ù¾Ø±ÙˆÙØ§ÛŒÙ„ Ù…Ù†' })), 'the profile menu opens Â«Ù¾Ø±ÙˆÙØ§ÛŒÙ„ Ù…Ù†Â»');
  await guest.keyboard.press('Escape');
  await railOf(guest).getByRole('button', { name: /Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ/ }).click();
  await guest.getByRole('menuitem', { name: 'Ø®Ø±ÙˆØ¬ Ø§Ø² Ø­Ø³Ø§Ø¨' }).click();
  await guest.getByRole('dialog', { name: 'Ø®Ø±ÙˆØ¬ Ø§Ø² Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±ÛŒ' }).getByRole('button', { name: 'Ø®Ø±ÙˆØ¬ Ø§Ø² Ø­Ø³Ø§Ø¨' }).click();
  check(await visible(guest.getByRole('heading', { name: 'ÙˆØ±ÙˆØ¯ Ø¨Ù‡ ØªØ³Ú©â€ŒØ¯ÙˆÙ†' }), 15_000), 'signing out shows the sign-in screen');
  const cookies = await guestContext.cookies();
  check(!cookies.some((cookie) => /taskin_rt$/.test(cookie.name) && cookie.value), 'the refresh cookie is cleared');
  await guest.reload();
  check(await visible(guest.getByRole('heading', { name: 'ÙˆØ±ÙˆØ¯ Ø¨Ù‡ ØªØ³Ú©â€ŒØ¯ÙˆÙ†' }), 30_000), 'the session stays gone after a reload');

  /* ------------------------------------------------ Phase 2: a note is stored with its first words */

  const notePosts = [];
  const countNotePost = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/notes')) notePosts.push(request.url());
  };
  owner.on('request', countNotePost);
  await railOf(owner).getByRole('link', { name: 'ÛŒØ§Ø¯Ø¯Ø§Ø´Øªâ€ŒÙ‡Ø§' }).click();
  await owner.waitForURL('**/notes');
  const notebook = owner.getByRole('complementary', { name: 'Ø³ØªÙˆÙ† Ø²Ù…ÛŒÙ†Ù‡' });
  const noteList = owner.getByRole('region', { name: 'ÙÙ‡Ø±Ø³Øª Ù‡Ù…Ù‡ ÛŒØ§Ø¯Ø¯Ø§Ø´Øªâ€ŒÙ‡Ø§' }).getByRole('listitem');
  await notebook.getByRole('button', { name: 'ÛŒØ§Ø¯Ø¯Ø§Ø´Øª Ø¬Ø¯ÛŒØ¯' }).waitFor({ timeout: 15_000 });
  const notesBefore = await noteList.count();
  await notebook.getByRole('button', { name: 'ÛŒØ§Ø¯Ø¯Ø§Ø´Øª Ø¬Ø¯ÛŒØ¯' }).click();
  await owner.waitForTimeout(1_500); // past the autosave delay
  check(notePosts.length === 0, 'a new, blank note is not sent to the server');
  const noteTitle = owner.getByRole('textbox', { name: /Ø¹Ù†ÙˆØ§Ù†/ }).first();
  await noteTitle.pressSequentially('Ø¬Ù„Ø³Ù‡ Ù‡ÙØªÚ¯ÛŒ', { delay: 60 });
  check(await eventually(() => notePosts.length === 1, 10_000), 'its first words create it: one POST /notes');
  await owner.waitForTimeout(1_500);
  check(notePosts.length === 1, 'â€¦and only one, however many keystrokes follow');
  check(
    (await noteTitle.inputValue()) === 'Ø¬Ù„Ø³Ù‡ Ù‡ÙØªÚ¯ÛŒ' && (await noteTitle.evaluate((element) => element === document.activeElement)),
    'the editor keeps its text and focus while the note is stored',
  );
  await notebook.getByRole('button', { name: 'ÛŒØ§Ø¯Ø¯Ø§Ø´Øª Ø¬Ø¯ÛŒØ¯' }).click();
  await owner.waitForTimeout(1_000);
  await noteList.filter({ hasText: 'Ø¬Ù„Ø³Ù‡ Ù‡ÙØªÚ¯ÛŒ' }).getByRole('button').click();
  check(await eventually(async () => (await noteList.count()) === notesBefore + 1), 'switching away drops a blank draft');
  check(notePosts.length === 1, 'â€¦which never reached the server');
  owner.off('request', countNotePost);
  await owner.waitForTimeout(1_000);
  await owner.reload();
  check(
    await eventually(async () => (await noteList.count()) === notesBefore + 1 && (await noteList.filter({ hasText: 'Ø¬Ù„Ø³Ù‡ Ù‡ÙØªÚ¯ÛŒ' }).count()) === 1, 20_000),
    'after a reload: the note with words, and no blank one',
  );

  /* ------------------------------------------------ Phase 2: the plan's project limit */

  // The free plan allows five projects; the workspace has one.
  for (let index = 2; index <= 5; index += 1) {
    await quickCreate(owner, 'Ù¾Ø±ÙˆÚ˜Ù‡ Ø¬Ø¯ÛŒØ¯');
    dialog = owner.getByRole('dialog', { name: 'Ù¾Ø±ÙˆÚ˜Ù‡ Ø¬Ø¯ÛŒØ¯' });
    await dialog.getByLabel('Ù†Ø§Ù… Ù¾Ø±ÙˆÚ˜Ù‡').fill(`Ù¾Ø±ÙˆÚ˜Ù‡ ${index}`);
    await dialog.getByRole('button', { name: 'Ø§ÛŒØ¬Ø§Ø¯ Ù¾Ø±ÙˆÚ˜Ù‡' }).click();
    await dialog.waitFor({ state: 'detached' });
  }
  check(await eventually(async () => (await tree.getByRole('button', { name: /^Ù¾Ø±ÙˆÚ˜Ù‡ (5|Ûµ)/ }).count()) === 1, 15_000), 'five projects: the free plan is full');
  await quickCreate(owner, 'Ù¾Ø±ÙˆÚ˜Ù‡ Ø¬Ø¯ÛŒØ¯');
  const limitAlert = owner.getByRole('alertdialog', { name: 'Ø³Ù‚Ù Ù¾Ø±ÙˆÚ˜Ù‡â€ŒÙ‡Ø§ÛŒ Ø§ÛŒÙ† ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ Ù¾Ø± Ø´Ø¯Ù‡ Ø§Ø³Øª' });
  check(await visible(limitAlert), 'at the limit Â«Ù¾Ø±ÙˆÚ˜Ù‡ Ø¬Ø¯ÛŒØ¯Â» shows an alert instead of the form');
  check((await owner.getByRole('dialog', { name: 'Ù¾Ø±ÙˆÚ˜Ù‡ Ø¬Ø¯ÛŒØ¯' }).count()) === 0, 'â€¦and the form never opens');
  check(await visible(limitAlert.getByText(/Â«Ø±Ø§ÛŒÚ¯Ø§Ù†Â» Ø­Ø¯Ø§Ú©Ø«Ø± Ûµ Ù¾Ø±ÙˆÚ˜Ù‡/)), 'the alert names the plan and its limit');
  await owner.screenshot({ path: `${out}/live_project_limit.png` });
  await limitAlert.getByRole('button', { name: 'Ù…ØªÙˆØ¬Ù‡ Ø´Ø¯Ù…' }).click();
  check(await eventually(async () => (await limitAlert.count()) === 0), 'the alert closes');

  /* ------------------------------------------------ Phase 3.1: the owner's project trash */

  const lastProject = tree.getByRole('button', { name: /^Ù¾Ø±ÙˆÚ˜Ù‡ (5|Ûµ)/ });
  await lastProject.hover();
  await tree.getByRole('button', { name: /^Ø­Ø°Ù Ù¾Ø±ÙˆÚ˜Ù‡ Ù¾Ø±ÙˆÚ˜Ù‡ (5|Ûµ)$/ }).click();
  dialog = owner.getByRole('dialog', { name: /^Ø­Ø°Ù Ù¾Ø±ÙˆÚ˜Ù‡ Â«Ù¾Ø±ÙˆÚ˜Ù‡ (5|Ûµ)Â»$/ });
  await dialog.getByRole('button', { name: 'Ø§Ù†ØªÙ‚Ø§Ù„ Ø¨Ù‡ Ø³Ø·Ù„ Ø²Ø¨Ø§Ù„Ù‡' }).click();
  check(await eventually(async () => (await lastProject.count()) === 0, 10_000), 'the owner moves a project to the trash: it leaves the tree');
  await owner.getByRole('button', { name: 'Ø¢Ø±Ø´ÛŒÙˆ / Ø³Ø·Ù„ Ø²Ø¨Ø§Ù„Ù‡' }).click();
  dialog = owner.getByRole('dialog', { name: 'Ø¢Ø±Ø´ÛŒÙˆ / Ø³Ø·Ù„ Ø²Ø¨Ø§Ù„Ù‡' });
  const trashed = dialog.getByRole('listitem').filter({ hasText: /Ù¾Ø±ÙˆÚ˜Ù‡ (5|Ûµ)/ });
  check(await visible(trashed, 10_000), 'the trash lists it, from the server');
  check(await visible(trashed.getByText('Û´Û° Ø±ÙˆØ² ØªØ§ Ù¾Ø§Ú©â€ŒØ³Ø§Ø²ÛŒ')), 'â€¦restorable for 40 days');
  await owner.reload();
  await owner.getByRole('button', { name: 'Ø¢Ø±Ø´ÛŒÙˆ / Ø³Ø·Ù„ Ø²Ø¨Ø§Ù„Ù‡' }).click();
  check(await visible(dialog.getByRole('listitem').filter({ hasText: /Ù¾Ø±ÙˆÚ˜Ù‡ (5|Ûµ)/ }), 15_000), 'the deletion is stored: still in the trash after a reload');
  await dialog.getByRole('button', { name: /^Ø¨Ø§Ø²ÛŒØ§Ø¨ÛŒ Ù¾Ø±ÙˆÚ˜Ù‡ (5|Ûµ)$/ }).click();
  check(await eventually(async () => (await lastProject.count()) === 1, 15_000), 'Â«Ø¨Ø§Ø²ÛŒØ§Ø¨ÛŒÂ» brings it back into the tree');
  check(await visible(dialog.getByText('Ø³Ø·Ù„ Ø²Ø¨Ø§Ù„Ù‡ Ø®Ø§Ù„ÛŒ Ø§Ø³Øª')), 'the trash is empty again');
  await owner.keyboard.press('Escape');

  /* ------------------------------------------------ Phase 3.1: a removed member keeps their history */

  await railOf(owner).getByRole('link', { name: 'Ø§Ø¹Ø¶Ø§ÛŒ Ø³Ø§Ø²Ù…Ø§Ù†' }).click();
  await owner.waitForURL('**/directory');
  await owner.getByRole('button', { name: `Ø­Ø°Ù ${guestName} Ø§Ø² ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ` }).click();
  dialog = owner.getByRole('dialog', { name: `Ø­Ø°Ù ${guestName} Ø§Ø² ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ` });
  await dialog.getByLabel('Ø±Ù…Ø² Ù…Ø¯ÛŒØ±').fill('Taskin-2026!');
  await dialog.getByRole('button', { name: 'Ø­Ø°Ù Ø§Ø² ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ' }).click();
  check(await eventually(async () => (await owner.getByRole('listitem').filter({ hasText: guestName }).count()) === 0, 15_000), 'the owner removes the guest from the workspace (with the admin password)');
  await railOf(owner).getByRole('link', { name: 'Ú¯ÙØªÚ¯ÙˆÙ‡Ø§' }).click();
  await owner.waitForURL('**/chats');
  await owner.reload();
  await owner.getByRole('button', { name: new RegExp(guestName) }).first().click({ timeout: 20_000 });
  const formerThread = owner.getByRole('region', { name: `Ú¯ÙØªÚ¯ÙˆÛŒ ${guestName}` });
  const formerBubble = formerThread.locator('div.group\\/message').filter({ hasText: 'Ø¯ÛŒØ¯Ù…ØŒ Ù…Ù…Ù†ÙˆÙ†!' }).last();
  check(await visible(formerBubble, 15_000), 'their messages stay in the direct chat, still titled with their name');
  check(await visible(formerBubble.getByText('Ø¹Ø¶Ùˆ Ø³Ø§Ø¨Ù‚')), 'â€¦marked Â«Ø¹Ø¶Ùˆ Ø³Ø§Ø¨Ù‚Â», after a reload too');
  await owner.screenshot({ path: `${out}/live_former_member.png` });

  /* ------------------------------------------------ M4: a workspace icon, uploaded */

  await railOf(owner).getByRole('button', { name: /^ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ ÙØ¹Ø§Ù„/ }).click();
  await owner.getByRole('menuitem', { name: 'Ø§ÛŒØ¬Ø§Ø¯ ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ Ø¬Ø¯ÛŒØ¯' }).click();
  dialog = owner.getByRole('dialog', { name: 'Ø§ÛŒØ¬Ø§Ø¯ ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ Ø¬Ø¯ÛŒØ¯' });
  await dialog.getByRole('textbox', { name: 'Ù†Ø§Ù… ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ' }).fill(`ÙØ¶Ø§ÛŒ Ù†Ø´Ø§Ù†â€ŒØ¯Ø§Ø± ${runId}`);
  await dialog.locator('input[type=file]').setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByRole('button', { name: 'Ø§ÛŒØ¬Ø§Ø¯ Ùˆ ÙˆØ±ÙˆØ¯' }).click();
  check(await eventually(async () => ((await railOf(owner).getByRole('button', { name: /^ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ ÙØ¹Ø§Ù„/ }).textContent()) ?? '').includes('ÙØ¶Ø§ÛŒ Ù†Ø´Ø§Ù†â€ŒØ¯Ø§Ø±'), 20_000), 'the new workspace opens');
  const icon = railOf(owner).getByRole('button', { name: /^ÙØ¶Ø§ÛŒ Ú©Ø§Ø±ÛŒ ÙØ¹Ø§Ù„/ }).locator('img');
  check(
    await eventually(async () => ((await icon.getAttribute('src').catch(() => null)) ?? '').startsWith('http') && (await icon.evaluate((image) => image.complete && image.naturalWidth > 0)), 20_000),
    'its icon is the uploaded picture, served from storage',
  );
} catch (error) {
  // A step that cannot run is a failure too; the console problems below usually say why.
  check(false, `the flow stopped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  await owner.screenshot({ path: `${out}/live_failure_owner.png` }).catch(() => undefined);
  await guest.screenshot({ path: `${out}/live_failure_guest.png` }).catch(() => undefined);
}

await finish(browser);
