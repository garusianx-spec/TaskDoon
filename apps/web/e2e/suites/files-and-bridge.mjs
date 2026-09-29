import { base, check, eventually, finish, launch, visible, watchConsole } from '../lib/harness.mjs';

// M4 in the demo: files picked in the chat show at once (local previews), a message becomes a
// task that remembers it, and the task's «پیام مبدأ» leads back to the message.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n${' '.repeat(120)}\n%%EOF\n`);

const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
watchConsole(page);
await page.goto(base + '/chats', { waitUntil: 'networkidle' });
const chat = page.getByRole('region', { name: 'گفتگوی محصول و طراحی' });
check(await visible(chat), 'the product conversation is open');

await page.getByTestId('chat-file-input').setInputFiles([
  { name: 'طرح صفحه.png', mimeType: 'image/png', buffer: PNG },
  { name: 'صورت‌جلسه.pdf', mimeType: 'application/pdf', buffer: PDF },
]);
// Picked files wait in the preview (Phase 2) until they are sent.
const preview = page.getByRole('dialog', { name: 'ارسال پیوست' });
check(await visible(preview), 'picked files wait in the preview');
await preview.getByRole('button', { name: 'ارسال', exact: true }).click();
const picture = chat.getByRole('img', { name: 'طرح صفحه.png' });
check(await eventually(async () => picture.evaluate((image) => image.complete && image.naturalWidth > 0).catch(() => false)), 'a picked image shows as a picture at once');
check(await visible(chat.getByText('صورت‌جلسه.pdf')), 'a picked document shows as a file card');

const bubble = chat.locator('div.group\\/message').filter({ hasText: 'صورت‌جلسه.pdf' }).last();
await bubble.hover();
await bubble.getByRole('button', { name: 'تبدیل به وظیفه' }).click();
const dialog = page.getByRole('dialog', { name: 'تبدیل پیام به وظیفه' });
check(await visible(dialog.getByRole('listitem').filter({ hasText: 'صورت‌جلسه.pdf' })), 'the message’s file rides along into the task composer');
await dialog.getByRole('button', { name: 'ایجاد وظیفه از پیام' }).click();
check(await visible(bubble.getByRole('button', { name: 'مشاهده وظیفه مرتبط' })), 'the message now carries a linked-task chip');

const source = page.getByRole('region', { name: 'پیام مبدأ' });
check(await visible(source), 'the new task names its source message');
check(await visible(source.getByText(/در محصول و طراحی/)), 'with the conversation it is in');
await source.getByRole('button', { name: 'نمایش پیام در گفتگو' }).click();
check(await eventually(async () => ((await chat.locator('[data-highlighted="true"]').textContent()) ?? '').includes('صورت‌جلسه.pdf')), '«نمایش پیام در گفتگو» highlights the message');
check(await eventually(async () => (await chat.locator('[data-highlighted="true"]').count()) === 0, 5000), 'the highlight fades');

await finish(browser);
