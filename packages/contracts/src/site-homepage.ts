import type { SiteSection } from './site.js';

/** A draft template, and defaults for newly installed CMS instances. Never overwrites published content. */
const start = { label: 'ایجاد رایگان فضای کاری', href: '/feed' };
const demo = { label: 'درخواست دمو و مشاوره', href: '/demo-request' };

const block = (id: string, type: SiteSection['type'], fields: Partial<SiteSection>): SiteSection => ({
  id,
  type,
  visible: true,
  ...fields,
  data: { presentation: `home-${type}`, ...fields.data },
});

export const TASKDOON_HOME_SECTIONS: SiteSection[] = [
  block('home-hero', 'hero', {
    title: 'همکاری هماهنگ، پروژه‌های شفاف، خروجی‌های به‌موقع',
    description:
      'مدیریت پروژه، بورد کانبان، گفتگوی تیمی و تقویم شمسی؛ همه در یک فضای کاری فارسی بدون پراکندگی ابزارها.',
    cta: start,
    secondaryCta: { label: 'مسیر یک کار را ببینید', href: '#home-workflow' },
  }),
  block('home-workflow', 'steps', {
    title: 'جایی که گفتگو به اقدام تبدیل می‌شود',
    description:
      'تصمیم‌های کاری را در متن گفتگو جا نگذارید؛ هر پیام متنی یا صوتی را با یک کلیک به وظیفه‌ای با مسئول و مهلت مشخص تبدیل کنید. اینجا خودتان امتحان کنید.',
    data: { workflow: 'message-to-task' },
  }),
  block('home-outcomes', 'benefits', {
    title: 'چرا تیم‌های پیشرو تسک‌دون را انتخاب می‌کنند؟',
    items: [
      {
        title: 'شفافیت کامل در مالکیت کارها',
        description: 'هر وظیفه یک مسئول مستقیم و ناظر دارد؛ اعضا دقیقاً می‌دانند قدم بعدی با چه کسی است.',
      },
      {
        title: 'پایش لحظه‌ای پیشرفت پروژه',
        description: 'نماهای کانبان، فهرست و گانت دید همه‌جانبه‌ای از روند پیشرفت ارائه می‌دهند.',
      },
      {
        title: 'پایان پراکندگی اطلاعات و فایل‌ها',
        description: 'گفتگوها، اسناد و صورت‌جلسات در همان بستر پروژه آرشیو و نگهداری می‌شوند.',
      },
      {
        title: 'بومی‌سازی اصیل با تقویم جلالی',
        description: 'رابط کاربری راست‌به‌چپ، اعداد فارسی و هماهنگی کامل با تقویم و تعطیلات رسمی ایران.',
      },
    ],
  }),
  block('home-features', 'feature-grid', {
    title: 'جعبه‌ابزار جامع تیم شما برای مدیریت کارها',
    items: [
      {
        id: 'tasks',
        title: 'مدیریت وظایف و بورد کانبان',
        description:
          'وظایف را با اولویت‌بندی، برچسب‌ها، زیرکارها و موعد تحویل سازمان‌دهی کنید و پیشرفت را ستون‌به‌ستون ببینید.',
        href: '/features/task-management',
        media: {
          src: '/marketing/tasks.png',
          alt: 'بورد کانبان و فهرست وظایف در تسک‌دون',
          width: 1440,
          height: 960,
        },
      },
      {
        id: 'chat',
        title: 'گفتگوی تیمی متصل به پروژه‌ها',
        description:
          'کانال‌های کاری، پیام مستقیم، اشتراک فایل و ویس؛ با امکان تبدیل مستقیم پیام به وظیفه بدون از دست رفتن زمینه.',
        href: '/features/team-chat',
        media: {
          src: '/marketing/chat.png',
          alt: 'گفتگوی تیمی و ارسال فایل در تسک‌دون',
          width: 1440,
          height: 960,
        },
      },
      {
        id: 'notes',
        title: 'یادداشت‌ها و صورت‌جلسات ساختاریافته',
        description:
          'ایده‌ها، صورت‌جلسه‌ها و چک‌لیست‌ها را مستندسازی کنید و هر بند را مستقیماً به تسک اجرایی تبدیل کنید.',
        href: '/features/notes',
        media: {
          src: '/marketing/notes.png',
          alt: 'یادداشت‌ها و چک‌لیست‌ها در تسک‌دون',
          width: 1440,
          height: 960,
        },
      },
    ],
  }),
  block('home-start', 'steps', {
    title: 'شروع کار در ۳ گام ساده',
    items: [
      {
        title: 'ورود سریع با شماره همراه',
        description: 'بدون نیاز به رمز عبور پیچیده؛ با پیامک یک‌بارمصرف یا رمز اختصاصی در چند ثانیه وارد شوید.',
      },
      {
        title: 'ایجاد یا پیوستن به فضای کاری',
        description: 'سازمان خود را بسازید یا با دعوت‌نامه همکاران به فضای کاری تیم ملحق شوید.',
      },
      {
        title: 'تعریف پروژه و شروع هماهنگی',
        description: 'اعضای تیم را دعوت کنید، اولین پروژه را بسازید و کارهای مشترک را جلو ببرید.',
      },
    ],
  }),
  block('home-usecases', 'benefits', {
    title: 'یک پلتفرم یکپارچه برای تمام تیم‌ها و تخصص‌ها',
    items: [
      {
        title: 'تیم‌های فنی و توسعه نرم‌افزار',
        description: 'اسپرینت‌ها، باگ‌ها و بازبینی تسک‌ها را با بورد چابک و ردیابی وابستگی‌ها مدیریت کنید.',
      },
      {
        title: 'تیم‌های محصول و طراحی تجربه کاربری',
        description: 'وایرفریم‌ها، بریف‌ها و بازخوردهای کاربری را از ایده تا لانچ مستند و اجرا کنید.',
      },
      {
        title: 'تیم‌های بازاریابی و تولید محتوا',
        description: 'کمپین‌ها، تقویم تولید محتوا و هماهنگی انتشار را با مسئول و مهلت شفاف پیش ببرید.',
      },
      {
        title: 'مدیران عامل و رهبران کسب‌وکار',
        description: 'دید کلان ۳۶۰ درجه از وضعیت پروژه‌ها، کنترل دسترسی و پیشرفت اهداف بدون جلسات فرسایشی.',
      },
    ],
  }),
  block('home-trust', 'testimonials', { data: { sampleContent: true } }),
  block('home-pricing', 'pricing-preview', {
    title: 'تعرفه‌های شفاف، متناسب با مقیاس تیم شما',
    description:
      'از پلن رایگان برای تیم‌های کوچک آغاز کنید و با رشد سازمان، از امکانات پیشرفته و ظرفیت نامحدود بهره‌مند شوید.',
  }),
  block('home-faq', 'faq', {
    title: 'پرسش‌های متداول درباره تسک‌دون',
    description: 'پاسخ به سوالات پرتکرار درباره شروع به کار، امکانات، امنیت و تعرفه‌ها.',
    data: { limit: 8 },
  }),
  block('home-articles', 'content-grid', {
    title: 'تازه‌ترین مقاله‌ها و راهنماهای کاربردی',
    description: 'بینش‌ها و روش‌های اثبات‌شده برای مدیریت بهتر پروژه‌ها و افزایش بهره‌وری تیم.',
    cta: { label: 'دیدن همه مقاله‌ها', href: '/blog' },
    data: { source: 'article', limit: 3 },
  }),
  block('home-cta', 'cta', {
    title: 'همین امروز همکاری هوشمندانه‌تر را تجربه کنید',
    description: 'فضای کاری رایگان تیمتان را در کمتر از یک دقیقه راه‌اندازی کنید و مدیریت کارها را متحول سازید.',
    cta: start,
    secondaryCta: demo,
  }),
].map((section, sortOrder) => ({ ...section, sortOrder }));
