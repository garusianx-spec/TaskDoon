import type { SiteSection } from './site.js';

/** A draft template, and defaults for newly installed CMS instances. Never overwrites published content. */
const start = { label: 'شروع همکاری', href: '/feed' };
const block = (id: string, type: SiteSection['type'], fields: Partial<SiteSection>): SiteSection => ({ id, type, visible: true, ...fields, data: { presentation: `home-${type}`, ...fields.data } });
export const TASKDOON_HOME_SECTIONS: SiteSection[] = [
  block('home-hero', 'hero', { title: 'تیم هماهنگ‌تر،\nپروژه‌های روشن‌تر.', description: 'وظایف، پروژه‌ها، گفتگوها و یادداشت‌های تیم را در یک فضای کاری فارسی کنار هم داشته باشید. مسئول هر کار مشخص باشد و قدم بعدی از گفتگو جدا نماند.', cta: start, secondaryCta: { label: 'مسیر یک کار را ببینید', href: '#home-workflow' } }),
  block('home-workflow', 'steps', { title: 'گفتگو تمام می‌شود؛\nپیگیری کار ادامه دارد.', description: 'تصمیم تیم را به وظیفه‌ای با مسئول و مهلت مشخص تبدیل کنید و مسیر انجامش را در پروژه ببینید. اینجا خودتان امتحان کنید.', data: { workflow: 'message-to-task' } }),
  block('home-outcomes', 'benefits', { title: 'هماهنگی کمتر پراکنده،\nتمرکز بیشتر بر کار.', items: [
    { title: 'مالکیت روشن', description: 'هر کار یک مسئول مشخص دارد؛ اعضا می‌دانند قدم بعدی با چه کسی است.' },
    { title: 'پروژهٔ قابل پیگیری', description: 'وضعیت کارها را در کنار هم ببینید و پیشرفت پروژه را دنبال کنید.' },
    { title: 'گفتگوی مرتبط', description: 'فایل‌ها و تصمیم‌های تیم در کنار کارهای مرتبط باقی می‌مانند.' },
    { title: 'تاریخ‌های آشنا', description: 'با تقویم شمسی و رابط راست‌به‌چپ برای روزهای پیش رو برنامه بریزید.' },
  ] }),
  block('home-features', 'feature-grid', { title: 'ابزارهای تیم،\nدر یک جریان کار.', items: [
    { id: 'tasks', title: 'از یک کار کوچک تا یک پروژهٔ کامل', description: 'وظایف را با مسئول، اولویت و مهلت روشن تعریف کنید و با نمای فهرست، کانبان و گانت پیگیری کنید.', href: '/features/task-management', media: { src: '/marketing/tasks.png', alt: 'فهرست وظایف تسک‌دون با مسئول و مهلت، با دادهٔ نمونه', width: 1440, height: 960 } },
    { id: 'chat', title: 'گفتگو، در کنار همان پروژه', description: 'با تیم گفتگو کنید، فایل به اشتراک بگذارید و تصمیم‌هایی را که به اقدام نیاز دارند به وظیفه تبدیل کنید.', href: '/features/team-chat', media: { src: '/marketing/chat.png', alt: 'گفتگوی تیمی تسک‌دون با دادهٔ نمونه', width: 1440, height: 960 } },
    { id: 'notes', title: 'تصمیم‌های جلسه را نگه دارید', description: 'یادداشت، ایده و چک‌لیست بنویسید و موارد نیازمند پیگیری را از دل یادداشت به وظیفه تبدیل کنید.', href: '/features/notes', media: { src: '/marketing/notes.png', alt: 'یادداشت‌ها و چک‌لیست در تسک‌دون با دادهٔ نمونه', width: 1440, height: 960 } },
  ] }),
  block('home-start', 'steps', { title: 'از اولین قدم، با هم.', items: [
    { title: 'وارد شوید', description: 'شماره موبایل را تأیید کنید. اگر حساب تازه است، فقط نامتان را اضافه کنید.' },
    { title: 'به تیم بپیوندید', description: 'دعوت‌نامهٔ همکاران را باز کنید یا برای تیم خود یک فضای کاری بسازید.' },
    { title: 'اولین کار را جلو ببرید', description: 'پروژه را تعریف کنید، مسئول کار را مشخص کنید و گفتگو را همان‌جا ادامه دهید.' },
  ] }),
  block('home-usecases', 'benefits', { title: 'یک فضای مشترک،\nبرای جریان‌های کاری متفاوت.', items: [
    { title: 'تیم‌های محصول و توسعه', description: 'تصمیم، وظیفه و وضعیت پروژه را در یک مسیر نگه دارید.' },
    { title: 'تیم‌های محتوا و بازاریابی', description: 'تولید، بازبینی و انتشار را با مسئول و مهلت پیگیری کنید.' },
    { title: 'مدیران و رهبران تیم', description: 'بدون گم شدن در گفتگوها، وضعیت و مالکیت کارها را ببینید.' },
    { title: 'کسب‌وکارهای در حال رشد', description: 'اعضا، پروژه‌ها و اطلاعات تیم را در فضای کاری مشترک سازمان دهید.' },
  ] }),
  block('home-trust', 'testimonials', { data: { sampleContent: true } }),
  block('home-pricing', 'pricing-preview', { title: 'متناسب با نیاز تیم انتخاب کنید.', description: 'امکانات و شرایط طرح‌های منتشرشده را بررسی کنید؛ برای پرسش دربارهٔ نیاز تیم با ما در ارتباط باشید.' }),
  block('home-faq', 'faq', { title: 'پیش از شروع،\nپاسخ پرسش‌هایتان را بگیرید.', description: 'پرسش‌های رایج دربارهٔ ورود، همکاری تیمی و امکانات تسک‌دون.', data: { limit: 6 } }),
  block('home-articles', 'content-grid', { title: 'برای همکاری بهتر،\nبیشتر بخوانید.', description: 'نوشته‌های منتشرشده دربارهٔ مدیریت کار و همکاری تیمی.', cta: { label: 'دیدن همهٔ نوشته‌ها', href: '/blog' }, data: { source: 'article', limit: 3 } }),
  block('home-cta', 'cta', { title: 'قدم بعدی تیم را\nبا هم روشن کنید.', description: 'وارد تسک‌دون شوید، به فضای کاری تیم بپیوندید و اولین کار مشترک را جلو ببرید.', cta: start, secondaryCta: { label: 'درخواست دمو', href: '/demo-request' } }),
].map((section, sortOrder) => ({ ...section, sortOrder }));
