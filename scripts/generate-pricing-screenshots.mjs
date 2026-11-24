import { chromium } from 'playwright-core';

const htmlContent = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تعرفه‌ها و پلن‌های تسک‌دون</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            'brand-solid': '#2563eb',
            'brand-solid-hover': '#1d4ed8',
          }
        }
      }
    }
  </script>
  <style>
    * {
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, sans-serif;
      box-sizing: border-box;
    }
    body {
      background-color: #000000;
      color: #ffffff;
      margin: 0;
      padding: 40px 20px;
    }
  </style>
</head>
<body class="bg-black text-white min-h-screen">
  <div class="max-w-5xl mx-auto">
    <!-- Header -->
    <div class="text-center mb-10">
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white mb-3">پلن‌های شفاف و منعطف تسک‌دون</h1>
      <p class="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">متناسب با رشد تیم شما؛ ۴۰٪ زیر قیمت میزیتو همراه با سهمیه اختصاصی فضای ابری.</p>
    </div>

    <!-- Toggle -->
    <div class="mb-10 sm:mb-12 flex justify-center" role="group" aria-label="دوره قیمت‌گذاری">
      <div class="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0d121f] p-1.5 shadow-xl">
        <button id="monthly-btn" type="button" class="min-h-[44px] rounded-lg px-5 py-2 text-sm font-bold transition-all duration-200 bg-brand-solid text-white shadow-md">
          ماهانه
        </button>
        <button id="yearly-btn" type="button" class="flex min-h-[44px] items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold transition-all duration-200 text-zinc-400 hover:text-white">
          <span>سالانه</span>
          <span class="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
            ۲ ماه رایگان
          </span>
        </button>
      </div>
    </div>

    <!-- Grid -->
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8 max-w-5xl mx-auto">
      <!-- Plan 1: Free Starter -->
      <article class="relative flex flex-col rounded-2xl p-6 sm:p-8 transition-all duration-300 shadow-xl border border-white/10 bg-[#090d16] hover:border-white/20">
        <div class="mb-4">
          <h3 class="text-xl sm:text-2xl font-bold text-white mb-2">رایگان (استارتر)</h3>
          <p class="text-sm text-zinc-400 leading-relaxed min-h-[44px]">
            برای شروع کار انفرادی و تیم‌های کوچک جهت مدیریت متمرکز پروژه‌ها، کارها و ارتباطات.
          </p>
        </div>

        <div class="mb-6 flex flex-wrap items-baseline gap-2 border-b border-white/10 pb-6">
          <strong class="text-3xl sm:text-4xl font-extrabold text-white">رایگان</strong>
          <span class="text-sm font-medium text-zinc-400">همیشه رایگان</span>
        </div>

        <a href="/auth/sign-up" class="mb-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 font-semibold transition-all duration-200 border border-white/15 bg-white/10 text-white hover:bg-white/15">
          <span>شروع رایگان</span>
          <span aria-hidden="true">←</span>
        </a>

        <ul class="flex-1 space-y-3.5 text-sm text-zinc-300">
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span class="font-bold text-white">تا ۵ کاربر</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>۱ گیگابایت فضای ابری ذخیره‌سازی چت و فایل</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>مدیریت کارها و بورد کانبان</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>پروژه‌ها و یادداشت‌های نامحدود</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>گفت‌وگوی تیمی و اشتراک فایل</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>تقویم شمسی و هماهنگی کارها</span>
          </li>
        </ul>

        <dl class="mt-6 space-y-2 border-t border-white/10 pt-4 text-xs text-zinc-400">
          <div class="flex justify-between items-center py-0.5">
            <dt class="text-zinc-400">تعداد اعضای مجاز</dt>
            <dd class="font-semibold text-zinc-200">تا ۵ کاربر</dd>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <dt class="text-zinc-400">فضای ذخیره‌سازی ابری</dt>
            <dd class="font-semibold text-zinc-200">۱ گیگابایت</dd>
          </div>
        </dl>
      </article>

      <!-- Plan 2: Professional with Team Size Selector -->
      <article class="relative flex flex-col rounded-2xl p-6 sm:p-8 transition-all duration-300 shadow-xl border-2 border-brand-solid bg-[#0d121f] shadow-[0_0_40px_rgba(37,99,235,0.18)] hover:shadow-[0_0_55px_rgba(37,99,235,0.28)]">
        <div class="absolute -top-3.5 start-6">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-brand-solid px-3.5 py-1 text-xs font-bold text-white shadow-lg">
            <span class="size-2 rounded-full bg-white animate-pulse" aria-hidden="true"></span>
            پیشنهاد تسک‌دون · ۴۰٪ زیر قیمت میزیتو
          </span>
        </div>

        <div class="mb-4">
          <h3 class="text-xl sm:text-2xl font-bold text-white mb-2">حرفه‌ای (تیم‌های پویا)</h3>
          <p class="text-sm text-zinc-400 leading-relaxed min-h-[44px]">
            برای تیم‌های در حال رشد نیازمند ظرفیت مقیاس‌پذیر، سهمیه اختصاصی استوریج، گانت‌چارت و امنیت پیشرفته.
          </p>
        </div>

        <!-- Team Size Selector -->
        <div class="mb-6 rounded-xl border border-white/10 bg-[#090d16] p-3">
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-bold text-zinc-300">انتخاب سایز تیم:</label>
            <span id="tier-storage" class="text-xs font-semibold text-emerald-400">سهمیه ابری: ۵ گیگابایت</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5">
            <button id="btn-10" type="button" class="min-h-[42px] rounded-lg text-xs font-bold bg-brand-solid text-white shadow-md">۱۰ کاربر</button>
            <button id="btn-20" type="button" class="min-h-[42px] rounded-lg text-xs font-bold bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white">۲۰ کاربر</button>
            <button id="btn-50" type="button" class="min-h-[42px] rounded-lg text-xs font-bold bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white">۵۰ کاربر</button>
            <button id="btn-100" type="button" class="min-h-[42px] rounded-lg text-xs font-bold bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white">۱۰۰ کاربر</button>
          </div>
        </div>

        <!-- Price display -->
        <div class="mb-6 flex flex-wrap items-baseline gap-2 border-b border-white/10 pb-6">
          <strong id="pro-price" class="text-3xl sm:text-4xl font-extrabold text-white">۳۵۰٬۰۰۰</strong>
          <span id="pro-period" class="text-sm font-medium text-zinc-400">تومان / ماه</span>
        </div>

        <a id="pro-cta" href="/auth/sign-up?plan=pro&users=10" class="mb-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 font-semibold transition-all duration-200 bg-brand-solid text-white shadow-md hover:bg-brand-solid-hover hover:shadow-lg">
          <span id="pro-cta-text">ارتقا آنلاین (۱۰ کاربر)</span>
          <span aria-hidden="true">←</span>
        </a>

        <ul class="flex-1 space-y-3.5 text-sm text-zinc-300">
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span id="tier-users-feat" class="font-bold text-white">تا ۱۰ کاربر فعال</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span id="tier-storage-feat" class="font-bold text-white">۵ گیگابایت فضای ذخیره‌سازی ابری</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>تمام امکانات پلن رایگان</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>تاریخچه نامحدود پیام‌ها و فایل‌ها</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>سطوح دسترسی و نقش‌های پیشرفته تیم</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>گانت‌چارت و بورد پیشرفته</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span>
            <span>پشتیبانی اختصاصی آنلاین با اولویت پاسخگویی</span>
          </li>
        </ul>

        <dl class="mt-6 space-y-2 border-t border-white/10 pt-4 text-xs text-zinc-400">
          <div class="flex justify-between items-center py-0.5">
            <dt class="text-zinc-400">تعداد اعضای مجاز</dt>
            <dd id="tier-users-limit" class="font-semibold text-zinc-200">تا ۱۰ کاربر</dd>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <dt class="text-zinc-400">فضای ذخیره‌سازی ابری</dt>
            <dd id="tier-storage-limit" class="font-semibold text-zinc-200">۵ گیگابایت</dd>
          </div>
        </dl>
      </article>
    </div>

    <!-- Enterprise Card for > 100 Users -->
    <div class="mt-8 rounded-2xl border border-white/10 bg-gradient-to-r from-[#0d121f] via-[#090d16] to-[#0d121f] p-6 sm:p-8 shadow-xl max-w-5xl mx-auto">
      <div class="flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="text-center md:text-start">
          <div class="inline-flex items-center gap-2 rounded-full bg-purple-500/10 border border-purple-500/30 px-3 py-1 text-xs font-bold text-purple-300 mb-2">
            سازمان‌ها و تیم‌های بزرگ
          </div>
          <h4 class="text-lg sm:text-xl font-bold text-white mb-1">
            بیشتر از ۱۰۰ کاربر دارید یا نیازمند نصب در سرور اختصاصی هستید؟
          </h4>
          <p class="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
            برای تیم‌های سازمانی بالای ۱۰۰ نفر، قراردادهای اختصاصی، انتقال امن داده‌ها و استقرار On-Premises با ما هماهنگ شوید.
          </p>
        </div>
        <a href="/demo-request" class="shrink-0 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-600/20 px-6 font-semibold text-purple-200 transition-colors hover:bg-purple-600/30">
          <span>تماس با فروش و نصب اختصاصی</span>
          <span aria-hidden="true">←</span>
        </a>
      </div>
    </div>

    <!-- Comparison Table -->
    <div class="mt-16 overflow-x-auto rounded-2xl border border-white/10 bg-[#090d16] p-4 sm:p-6 shadow-xl max-w-5xl mx-auto" role="region" aria-label="جدول مقایسهٔ پلن‌ها">
      <table class="w-full text-right text-sm">
        <caption class="pb-4 text-lg font-bold text-white text-right">مقایسه امکانات معرفی‌شده در پلن‌ها</caption>
        <thead>
          <tr class="border-b border-white/10 text-zinc-400">
            <th scope="col" class="py-3 px-4 text-start font-semibold">امکانات</th>
            <th scope="col" class="py-3 px-4 text-center font-bold text-white">رایگان</th>
            <th scope="col" class="py-3 px-4 text-center font-bold text-white">حرفه‌ای</th>
            <th scope="col" class="py-3 px-4 text-center font-bold text-purple-300">سازمانی</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          <tr class="hover:bg-white/[0.02] transition-colors">
            <th scope="row" class="py-3.5 px-4 font-medium text-zinc-300 text-start">ظرفیت کاربران</th>
            <td class="py-3.5 px-4 text-center font-semibold text-zinc-200">تا ۵ کاربر</td>
            <td class="py-3.5 px-4 text-center font-semibold text-white">۱۰ تا ۱۰۰ کاربر</td>
            <td class="py-3.5 px-4 text-center font-semibold text-purple-300">بیش از ۱۰۰ کاربر</td>
          </tr>
          <tr class="hover:bg-white/[0.02] transition-colors">
            <th scope="row" class="py-3.5 px-4 font-medium text-zinc-300 text-start">فضای ذخیره‌سازی ابری</th>
            <td class="py-3.5 px-4 text-center font-semibold text-zinc-200">۱ گیگابایت</td>
            <td class="py-3.5 px-4 text-center font-semibold text-white">۵ تا ۵۰ گیگابایت</td>
            <td class="py-3.5 px-4 text-center font-semibold text-purple-300">سفارشی و نامحدود</td>
          </tr>
          <tr class="hover:bg-white/[0.02] transition-colors">
            <th scope="row" class="py-3.5 px-4 font-medium text-zinc-300 text-start">مدیریت وظایف و کانبان</th>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
          </tr>
          <tr class="hover:bg-white/[0.02] transition-colors">
            <th scope="row" class="py-3.5 px-4 font-medium text-zinc-300 text-start">تقویم شمسی و رویدادها</th>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
          </tr>
          <tr class="hover:bg-white/[0.02] transition-colors">
            <th scope="row" class="py-3.5 px-4 font-medium text-zinc-300 text-start">تاریخچه نامحدود گفتگوها</th>
            <td class="py-3.5 px-4 text-center"><span aria-label="ندارد" class="text-zinc-600 font-bold">—</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
          </tr>
          <tr class="hover:bg-white/[0.02] transition-colors">
            <th scope="row" class="py-3.5 px-4 font-medium text-zinc-300 text-start">گانت‌چارت و گزارش‌گیری</th>
            <td class="py-3.5 px-4 text-center"><span aria-label="ندارد" class="text-zinc-600 font-bold">—</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
          </tr>
          <tr class="hover:bg-white/[0.02] transition-colors">
            <th scope="row" class="py-3.5 px-4 font-medium text-zinc-300 text-start">سطوح دسترسی پیشرفته</th>
            <td class="py-3.5 px-4 text-center"><span aria-label="ندارد" class="text-zinc-600 font-bold">—</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
          </tr>
          <tr class="hover:bg-white/[0.02] transition-colors">
            <th scope="row" class="py-3.5 px-4 font-medium text-zinc-300 text-start">پشتیبانی اختصاصی آنلاین</th>
            <td class="py-3.5 px-4 text-center"><span aria-label="ندارد" class="text-zinc-600 font-bold">—</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓</span></td>
            <td class="py-3.5 px-4 text-center"><span class="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">✓ ویژه</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

async function run() {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  // 1. Desktop Viewport (1280x900)
  const desktopPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  await desktopPage.setContent(htmlContent, { waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(1000);
  await desktopPage.screenshot({
    path: '/Users/Mehdi/OpenBot/Shared/screenshots/pricing-desktop.png',
    fullPage: true,
  });
  console.log('Desktop screenshot saved: /Users/Mehdi/OpenBot/Shared/screenshots/pricing-desktop.png');

  // 2. Mobile Viewport (412x917 - Figma Mobile Standard)
  const mobilePage = await browser.newPage({
    viewport: { width: 412, height: 917 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mobilePage.setContent(htmlContent, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({
    path: '/Users/Mehdi/OpenBot/Shared/screenshots/pricing-mobile.png',
    fullPage: true,
  });
  console.log('Mobile screenshot saved: /Users/Mehdi/OpenBot/Shared/screenshots/pricing-mobile.png');

  // 3. Yearly toggle state screenshot
  await desktopPage.evaluate(() => {
    document.getElementById('monthly-btn').className =
      'min-h-[44px] rounded-lg px-5 py-2 text-sm font-bold transition-all duration-200 text-zinc-400 hover:text-white';
    document.getElementById('yearly-btn').className =
      'flex min-h-[44px] items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold transition-all duration-200 bg-brand-solid text-white shadow-md';
    document.getElementById('pro-price').innerText = '۳٬۵۰۰٬۰۰۰';
    document.getElementById('pro-period').innerText = 'تومان / سال';
  });
  await desktopPage.waitForTimeout(500);
  await desktopPage.screenshot({
    path: '/Users/Mehdi/OpenBot/Shared/screenshots/pricing-desktop-yearly.png',
    fullPage: true,
  });
  console.log('Yearly desktop screenshot saved: /Users/Mehdi/OpenBot/Shared/screenshots/pricing-desktop-yearly.png');

  await browser.close();
}

run().catch((err) => {
  console.error('Error generating screenshots:', err);
  process.exit(1);
});
