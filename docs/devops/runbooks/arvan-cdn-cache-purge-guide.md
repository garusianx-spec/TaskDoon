# چک‌لیست پاکسازی کش لبه ابر آروان (ArvanCloud CDN Cache Purge)
## تسک‌دون — راهنمای اقدام سریع برای مهدی

- **هدف:** رفع قطعی خطای `ERR_CACHE_MISS` فونت‌ها (`IRANYekanWebMedium.woff2` و `IRANYekanWebExtraBold.woff2`) در مرورگر کاربران با تازه‌سازی حافظه لبه CDN.
- **وضعیت سرور اصلی (Origin):** تاییدشده؛ سرور اصلی هدر ۱ ساله `Cache-Control: public, max-age=31536000, immutable` را بازمی‌گرداند. تنها CDN آروان نسخه قدیمی را در حافظه لبه خود نگه داشته است.
- **مدت‌زمان اقدام:** کمتر از ۱ دقیقه

---

### مراحل پاکسازی در پنل ابر آروان:

۱. وارد حساب کاربری خود در **[پنل ابر آروان](https://napi.arvancloud.ir/)** شوید.
۲. از منوی سمت راست، گزینه **شبکه توزیع محتوا (CDN)** را انتخاب کنید.
۳. روی دامنه **`taskdoone.ir`** کلیک کنید.
۴. از منوی تنظیمات دامنه، وارد بخش **«تنظیمات کش» (Caching)** شوید.
۵. زبانه **«پاکسازی کش» (Purge Cache)** را باز کنید.
۶. یکی از دو روش زیر را انتخاب کنید:
   - **روش سریع (پیشنهادی):** گزینه **«پاکسازی کل کش» (Purge All)** را بزنید. (به‌دلیل حجم سبک صفحات و ترافیک فعلی، هیچ اثر منفی ندارد).
   - **روش انتخابی (URL Specific):** آدرس‌های زیر را در کادر پاکسازی بر اساس URL وارد کنید:
     ```text
     https://taskdoone.ir/fonts/IRANYekanWebMedium.woff2
     https://taskdoone.ir/fonts/IRANYekanWebExtraBold.woff2
     https://taskdoone.ir/fonts/*
     ```
۷. دکمه **«تایید و پاکسازی»** را فشار دهید.

---

### اعتبارسنجی خودکار پس از پاکسازی:

بلافاصله پس از پاکسازی در پنل، فرمان زیر را برای بررسی سلامت اجرا کنید (یا از تیم DevOps بخواهید چک کند):

```bash
curl -sSI https://taskdoone.ir/fonts/IRANYekanWebMedium.woff2 | grep -i -E "cache-control|x-cache"
```

**نتیجه موفق:**
- `cache-control: public, max-age=31536000, immutable`
- درخواست اول: `x-cache: MISS`
- درخواست‌های بعدی: `x-cache: HIT` (با هدر ۱ ساله جدید)
