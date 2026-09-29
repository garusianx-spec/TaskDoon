import { base, check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

// Phase 2 in the demo: the attachment preview (thumbnails, add and remove, a caption, photos
// re-encoded on a canvas, «ارسال تصویر به صورت فایل», files dropped on the chat), voice-note
// speeds and new notes that are never kept blank. The project limit needs a real plan: the live
// flow covers it.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n${' '.repeat(120)}\n%%EOF\n`);

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
watchConsole(page);
const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });

/* ---------- 1. The attachment preview ---------- */

await page.goto(base + '/chats', { waitUntil: 'networkidle' });
const chat = page.getByRole('region', { name: 'گفتگوی محصول و طراحی' });
check(await visible(chat), 'the product conversation is open');

// A photo-like picture (smooth light, a little sensor noise) wider than a sent photo may be,
// drawn in the page itself: a PNG of several megabytes.
const photo = Buffer.from(
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 1500;
    const context = canvas.getContext('2d');
    const image = context.createImageData(canvas.width, canvas.height);
    let seed = 7;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const noise = ((seed >>> 24) % 17) - 8;
        const at = (y * canvas.width + x) * 4;
        image.data[at] = 128 + 90 * Math.sin(x / 210) + noise;
        image.data[at + 1] = 128 + 90 * Math.cos(y / 160) + noise;
        image.data[at + 2] = 128 + 60 * Math.sin((x + y) / 330) + noise;
        image.data[at + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }),
  'base64',
);

await page.getByTestId('chat-file-input').setInputFiles([
  { name: 'منظره.png', mimeType: 'image/png', buffer: photo },
  { name: 'برنامه.pdf', mimeType: 'application/pdf', buffer: PDF },
]);
const preview = page.getByRole('dialog', { name: 'ارسال پیوست' });
check(await visible(preview), 'picked files open the preview instead of sending');
const rows = preview.getByRole('list', { name: 'فایل‌های پیوست' }).getByRole('listitem');
check(await eventually(async () => (await rows.count()) === 2), 'each picked file is listed');
check(await visible(rows.filter({ hasText: 'منظره.png' }).getByText(/مگابایت|کیلوبایت/)), 'with its size');
check(
  await eventually(async () => rows.filter({ hasText: 'منظره.png' }).locator('img').evaluate((image) => image.complete && image.naturalWidth > 0)),
  'a picture shows its thumbnail',
);
check((await chat.getByText('برنامه.pdf').count()) === 0, 'nothing is sent while the preview is open');
await preview.getByRole('button', { name: 'حذف برنامه.pdf' }).click();
check(await eventually(async () => (await rows.count()) === 1), 'a file can be taken out of the preview');
check(await visible(preview.getByRole('button', { name: 'افزودن فایل' })), '«افزودن فایل» adds more');
await preview.getByTestId('attachment-add-input').setInputFiles({ name: 'پیوست دوم.pdf', mimeType: 'application/pdf', buffer: PDF });
check(await eventually(async () => (await rows.count()) === 2), '…and the added file joins the queue');
const asFile = preview.getByRole('checkbox', { name: 'ارسال تصویر به صورت فایل' });
check((await asFile.getAttribute('aria-checked')) === 'false', '«ارسال تصویر به صورت فایل» is offered, off by default');
await preview.getByPlaceholder('درج عنوان برای تصویر...').fill('نمای کلی پروژه');
await page.screenshot({ path: `${out}/p2_preview.png` });
await preview.getByRole('button', { name: 'ارسال', exact: true }).click();
check(await eventually(async () => (await preview.count()) === 0), 'the preview closes on send');

// Photos are re-encoded on a canvas (WebP) and scaled to at most 2560 px before any upload.
const sentPhoto = chat.getByRole('img', { name: 'منظره.webp' });
check(await eventually(async () => sentPhoto.evaluate((image) => image.complete && image.naturalWidth === 2560), 10_000), 'the photo is compressed to WebP and scaled down to 2560 px');
const photoBubble = chat.locator('div.group\\/message').filter({ has: page.getByRole('img', { name: 'منظره.webp' }) }).last();
check(await visible(photoBubble.getByText('نمای کلی پروژه')), 'the caption sits under the photo');
check(await visible(photoBubble.getByRole('button', { name: 'دانلود منظره.webp' })), 'a photo can still be downloaded');
check(await visible(chat.getByRole('button', { name: 'دانلود پیوست دوم.pdf' })), 'the document goes as a file card');

// «ارسال تصویر به صورت فایل»: the picture goes as it is, as a document card, not an inline photo.
await page.getByTestId('chat-file-input').setInputFiles({ name: 'نقشه.png', mimeType: 'image/png', buffer: PNG });
await asFile.click();
check(await eventually(async () => (await asFile.getAttribute('aria-checked')) === 'true'), 'the box can be ticked');
await preview.getByRole('button', { name: 'ارسال', exact: true }).click();
check(await visible(chat.getByRole('button', { name: 'دانلود نقشه.png' })), 'a picture sent as a file keeps its name, as a download card');
check((await chat.getByRole('img', { name: 'نقشه.png' }).count()) === 0, '…with no inline photo');

// Files dropped anywhere on the conversation open the same preview.
await chat.evaluate((section) => {
  const transfer = new DataTransfer();
  transfer.items.add(new File(['دو خط'], 'یادداشت جلسه.txt', { type: 'text/plain' }));
  section.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  section.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
});
check(await eventually(async () => (await rows.filter({ hasText: 'یادداشت جلسه.txt' }).count()) === 1), 'a dropped file opens the preview');
check((await preview.getByRole('checkbox', { name: 'ارسال تصویر به صورت فایل' }).count()) === 0, 'no picture, no «به صورت فایل» box');
await preview.getByRole('button', { name: 'انصراف' }).click();
check(await eventually(async () => (await preview.count()) === 0 && (await chat.getByText('یادداشت جلسه.txt').count()) === 0), '«انصراف» sends nothing');

/* ---------- 2. Voice-note speeds ---------- */

const speed = chat.getByRole('button', { name: /^سرعت پیام صوتی/ }).first();
check(((await speed.getAttribute('aria-label')) ?? '').endsWith('۱×'), 'a voice note plays at ۱× by default');
await speed.click();
check(await eventually(async () => ((await speed.getAttribute('aria-label')) ?? '').endsWith('۱٫۵×')), '۱× → ۱٫۵×');
await speed.click();
check(await eventually(async () => ((await speed.getAttribute('aria-label')) ?? '').endsWith('۲×')), '۱٫۵× → ۲×');
const voice = speed.locator('..');
await voice.getByRole('button', { name: /^پخش پیام صوتی/ }).click();
const position = voice.getByRole('slider');
check(await eventually(async () => Number(await position.getAttribute('aria-valuenow')) >= 3, 2_000), 'at ۲× three seconds play in about one and a half');
await voice.getByRole('button', { name: /^توقف پیام صوتی/ }).click();
await speed.click();
check(await eventually(async () => ((await speed.getAttribute('aria-label')) ?? '').endsWith('۱×')), '۲× → back to ۱×');

/* ---------- 3. Blank notes are never kept ---------- */

await rail.getByRole('link', { name: 'یادداشت‌ها' }).click();
await page.waitForURL('**/notes');
const notebook = page.getByRole('complementary', { name: 'ستون زمینه' });
const list = page.getByRole('region', { name: 'فهرست همه یادداشت‌ها' }).getByRole('listitem');
check(await eventually(async () => (await list.count()) > 1), 'the notebook lists its notes');
const before = await list.count();
await notebook.getByRole('button', { name: 'یادداشت جدید' }).click();
check(await eventually(async () => (await list.count()) === before + 1), 'a new note opens as a draft');
await list.nth(1).getByRole('button').click();
check(await eventually(async () => (await list.count()) === before), 'switching away drops a blank draft');
check((await list.getByText('بدون عنوان').count()) === 0, '…leaving no untitled note behind');

await notebook.getByRole('button', { name: 'یادداشت جدید' }).click();
await page.getByRole('textbox', { name: /عنوان/ }).first().fill('   ');
await notebook.getByRole('navigation', { name: 'دسته‌ها' }).getByRole('button', { name: /^کاری/ }).click();
await notebook.getByRole('navigation', { name: 'دسته‌ها' }).getByRole('button', { name: /^همه یادداشت‌ها/ }).click();
check(await eventually(async () => (await list.count()) === before), 'spaces alone do not keep a note');

await notebook.getByRole('button', { name: 'یادداشت جدید' }).click();
await rail.getByRole('link', { name: 'گفتگوها' }).click();
await page.waitForURL('**/chats');
await rail.getByRole('link', { name: 'یادداشت‌ها' }).click();
await page.waitForURL('**/notes');
check(await eventually(async () => (await list.count()) === before), 'leaving the notebook drops a blank draft too');

await notebook.getByRole('button', { name: 'یادداشت جدید' }).click();
await page.getByRole('textbox', { name: /عنوان/ }).first().fill('یادداشتی که می‌ماند');
await list.nth(1).getByRole('button').click();
check(await eventually(async () => (await list.count()) === before + 1 && (await list.getByText('یادداشتی که می‌ماند').count()) === 1), 'a note with words in it stays');

await finish(browser);
