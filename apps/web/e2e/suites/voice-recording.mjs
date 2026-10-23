import { base, check, eventually, finish, launch, visible, watchConsole } from '../lib/harness.mjs';

// Synthetic browser audio only: these flags never open a physical microphone.
const browser = await launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  watchConsole(page);
  await page.addInitScript(() => {
    window.__voiceStreams = [];
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await capture(constraints);
      window.__voiceStreams.push(stream);
      return stream;
    };
  });
  await page.goto(base + '/chats', { waitUntil: 'networkidle' });
  const chat = page.getByRole('region', { name: 'گفتگوی محصول و طراحی' });
  check(await visible(chat), 'the conversation opens before recording');
  const before = await chat.getByRole('button', { name: /^سرعت پیام صوتی/ }).count();
  await chat.getByRole('button', { name: 'ضبط پیام صوتی', exact: true }).click();
  check(await eventually(async () => {
    const label = await chat.getByRole('status').filter({ hasText: 'در حال ضبط' }).innerText();
    const clock = label.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).match(/(\d+):(\d+)/);
    return clock !== null && Number(clock[1]) * 60 + Number(clock[2]) >= 2;
  }, 12000), 'the real MediaRecorder captures synthetic microphone audio');
  // Both clicks occur before the final recorder events return to the event loop.
  await chat.getByRole('button', { name: 'ارسال پیام صوتی', exact: true }).evaluate((button) => { button.click(); button.click(); });
  check(await eventually(async () => (await chat.getByRole('button', { name: /^سرعت پیام صوتی/ }).count()) === before + 1), 'sending adds exactly one voice note');
  check((await chat.getByRole('alert').count()) === 0, 'repeated send clicks do not show a false short-recording error');
  const audio = await page.evaluate(async () => {
    const player = [...document.querySelectorAll('audio')].find((element) => element.src.startsWith('blob:'));
    if (!player) return null;
    const blob = await (await fetch(player.src)).blob();
    const decoder = new AudioContext();
    try {
      const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
      return { type: blob.type, size: blob.size, duration: decoded.duration, channels: decoded.numberOfChannels };
    } finally {
      await decoder.close();
    }
  });
  check(audio !== null && audio.type.startsWith('audio/') && audio.size > 0 && audio.duration >= 1 && audio.channels > 0, 'the finalized voice Blob contains decodable nonempty audio');
  check(await eventually(() => page.evaluate(() => window.__voiceStreams.length === 1 && window.__voiceStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))), 'sending releases every microphone track');
  await context.close();

  const denied = await browser.newContext();
  const deniedPage = await denied.newPage();
  watchConsole(deniedPage);
  await deniedPage.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('test permission denied', 'NotAllowedError'); };
  });
  await deniedPage.goto(base + '/chats', { waitUntil: 'networkidle' });
  await deniedPage.getByRole('button', { name: 'ضبط پیام صوتی', exact: true }).click();
  check(await visible(deniedPage.getByRole('alert').filter({ hasText: 'تنظیمات مرورگر' })), 'permission denial explains how to enable the microphone');
  check(await visible(deniedPage.locator('#chat-composer-input')), 'permission denial leaves the composer usable');
  await denied.close();
} catch (error) {
  check(false, 'voice recording flow stopped: ' + error.message);
}
await finish(browser);
