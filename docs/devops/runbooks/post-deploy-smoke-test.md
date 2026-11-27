# چک‌لیست تست دود پس از استقرار (Post-Deploy Smoke Test)
## تسک‌دون — شاخه `feat/devops-stabilization-phase1`

- **زمان اجرا:** بلافاصله پس از هر دیپلوی موفق در Coolify و **پیش از** اعلام انتشار به تیم.
- **محیط:** `https://taskdoone.ir` (لبه: Caddy/Coolify + CDN آروان)
- **مدت تقریبی:** ۱۰ دقیقه
- **قاعده:** هر بند `FAIL` یعنی انتشار تایید نمی‌شود؛ به بخش Rollback در `unified-deploy-runbook.md` مراجعه شود.

---

## ۱. دروازه‌های حیاتی (Critical Gates)

| # | بررسی | فرمان | نتیجه مورد انتظار | نتیجه |
| :--- | :--- | :--- | :--- | :---: |
| 1.1 | سلامت API | `curl -sS -o /dev/null -w "%{http_code}" https://taskdoone.ir/api/health` | `200` | ⬜ |
| 1.2 | صفحه اصلی | `curl -sS -o /dev/null -w "%{http_code}" https://taskdoone.ir/` | `200` | ⬜ |
| 1.3 | فید کاربر | `curl -sS -o /dev/null -w "%{http_code}" https://taskdoone.ir/feed` | `200` | ⬜ |
| 1.4 | ورود از مسیر قدیمی | `curl -sS -o /dev/null -w "%{http_code}" -L https://taskdoone.ir/login` | `200` (پس از ریدایرکت) | ⬜ |
| 1.5 | وضعیت ریدایرکت | `curl -sSI https://taskdoone.ir/login \| head -1` | `308` یا `302` (نه `404`) | ⬜ |
| 1.6 | ثبت‌نام از مسیر قدیمی | `curl -sSI https://taskdoone.ir/signup \| head -1` | `308` یا `302` | ⬜ |
| 1.7 | نقشه سایت | `curl -sS -o /dev/null -w "%{http_code}" https://taskdoone.ir/sitemap.xml` | `200` | ⬜ |
| 1.8 | حضور `/blog` در سایت‌مپ | `curl -sS https://taskdoone.ir/sitemap.xml \| grep -c "/blog"` | بزرگ‌تر از ۰ | ⬜ |

---

## ۲. کش فونت (هدف اصلی این انتشار)

| # | بررسی | فرمان | نتیجه مورد انتظار | نتیجه |
| :--- | :--- | :--- | :--- | :---: |
| 2.1 | هدر فونت Medium | `curl -sSI https://taskdoone.ir/fonts/IRANYekanWebMedium.woff2 \| grep -i cache-control` | `public, max-age=31536000, immutable` | ⬜ |
| 2.2 | هدر فونت ExtraBold | `curl -sSI https://taskdoone.ir/fonts/IRANYekanWebExtraBold.woff2 \| grep -i cache-control` | `public, max-age=31536000, immutable` | ⬜ |
| 2.3 | وضعیت CDN پس از Purge | `curl -sSI https://taskdoone.ir/fonts/IRANYekanWebMedium.woff2 \| grep -i x-cache` | اولین درخواست `MISS`، سپس `HIT` | ⬜ |
| 2.4 | کش CSS (نباید رگرسیون بدهد) | `curl -sSI https://taskdoone.ir/_next/static/chunks/<hash>.css \| grep -i cache-control` | `immutable` | ⬜ |
| 2.5 | نبود `ERR_CACHE_MISS` در مرورگر | باز کردن صفحه اصلی در پنجره Incognito، سخت‌رفرش یک‌بار، سپس بارگذاری معمولی | هیچ خطای فونت در Console/Network | ⬜ |

> **یادآوری:** هشدار «preload CSS استفاده نشد» روی لبه فعلی (Caddy) باقی می‌ماند و خطا محسوب نمی‌شود؛ در بخش ۴ ثبت شود.

---

## ۳. جریان‌های کاربری (Functional)

| # | بررسی | روش | نتیجه مورد انتظار | نتیجه |
| :--- | :--- | :--- | :--- | :---: |
| 3.1 | ورود با حساب آزمایشی | فرم ورود از هدر → `/feed` | ورود موفق، بدون پرش پیاپی | ⬜ |
| 3.2 | تازگی سشن پس از رفرش | رفرش صفحه فید | کاربر خارج نمی‌شود | ⬜ |
| 3.3 | اتصال وب‌سوکت | ارسال یک پیام در فید/چت | پیام بدون رفرش ظاهر می‌شود | ⬜ |
| 3.4 | آپلود فایل | آپلود یک تصویر کوچک در تسک | فایل نمایش داده می‌شود (مسیر `/taskin-files`) | ⬜ |
| 3.5 | صفحه قیمت‌گذاری | باز کردن `/pricing` | بارگذاری کامل، دکمه‌ها فعال | ⬜ |
| 3.6 | صفحه ثبت‌نام لید | ارسال فرم دمو | پیام موفقیت، بدون خطای شبکه | ⬜ |

---

## ۴. مشاهدات و موارد شناخته‌شده (ثبت اجباری)

| مورد | وضعیت انتظار | یادداشت |
| :--- | :--- | :--- |
| هشدار preload فونت CSS در کنسول | ممکن است باقی بماند | ناشی از هدر `Link` استریم Next در لبه Caddy؛ بی‌اثر بر کاربر |
| هدر `x-xss-protection` در پاسخ‌ها | از لبه می‌آید | مربوط به تنظیمات Coolify/Caddy، نه کد |
| زمان پاسخ `/api/health` | کمتر از ۳۰۰ms | مقدار اندازه‌گیری‌شده ثبت شود |

---

## ۵. تاییدیه انتشار

| نقش | نام | تصمیم | زمان |
| :--- | :--- | :--- | :--- |
| مجری Smoke Test | | PASS / FAIL | |
| تایید نهایی انتشار | مهدی | منتشر شد / Rollback | |

**در صورت FAIL:** اجرای Rollback سطح R1 (بازگشت ایمیج `sha-…` قبلی در Coolify) + Purge کش آروان + اجرای مجدد همین چک‌لیست.
