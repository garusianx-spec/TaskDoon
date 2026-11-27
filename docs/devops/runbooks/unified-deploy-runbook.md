# Runbook استقرار یکپارچه و بازگشت سریع (Unified Deploy & Rollback Runbook)
## شاخه `feat/devops-stabilization-phase1` — تسک‌دون

- **هدف:** اجرای بدون‌وقفه انتشار شاخه ترکیبی DevOps پس از دریافت مجوز مالک محصول، با مسیر بازگشت (Rollback) مشخص و تست‌شده.
- **دامنه:** فایل‌های `docker-compose.prod.yml`، `infra/prod/**`، `apps/web/next.config.mjs`، `apps/web/src/app/sitemap.ts`، `apps/api/src/platform/db/migrate.ts`، `infra/ci/**`.
- **آخرین کامیت شاخه:** `6672d62`
- **وضعیت:** آماده انتشار — در انتظار مجوز `git push` و کلیدهای Coolify/S3 (بدون آن‌ها استقرار خودکار ممکن نیست).
- **هیچ مایگریشن اسکیمایی در این شاخه وجود ندارد** (`git diff --name-only main...HEAD | grep -i migration` خالی است)؛ بنابراین بازگشت نسخه در این انتشار، عملیات کد است و به بازگردانی دیتابیس نیاز ندارد.

---

## ۰. یافته‌های قطعی از بررسی لبه تولید (پیش از نوشتن این Runbook)

این موارد با `curl` روی `https://taskdoone.ir` در تاریخ ۵ آذر ۱۴۰۵ اندازه‌گیری شد و ترتیب استقرار را تعیین می‌کند:

| سنجه | مقدار مشاهده‌شده | نتیجه عملیاتی |
| :--- | :--- | :--- |
| هدر `via` پاسخ‌ها | `1.1 Caddy` | **لبه تولید فعلی Caddy (Coolify) است، نه Nginx این مخزن.** |
| هدر `server` | `ArvanCloud` + `x-cache: HIT` | یک CDN آروان جلوی Coolify قرار دارد؛ کش لبه باید پس از دیپلوی Purge شود. |
| `/fonts/IRANYekanWebMedium.woff2` | `200`, `cache-control: public, max-age=0` | علت مستقیم `ERR_CACHE_MISS`: مرورگر هر بار فونت را اعتبارسنجی مجدد می‌کند. |
| `/_next/static/chunks/*.css` | `cache-control: public, max-age=31536000, immutable` | کش CSS از قبل درست است؛ هشدار preload ربطی به کش ندارد. |
| `/login` | `404` | ریدایرکت شاخه هنوز مستقر نشده (طبق انتظار). |
| `/feed`, `/pricing`, `/sitemap.xml`, `/api/health` | `200` | نقاط Smoke پایه در حال حاضر سالم‌اند و مبنای مقایسه‌اند. |

**پیامدهای الزامی برای این استقرار:**

1. اصلاح کش فونت **فقط با ایمیج جدید وب** اثر می‌کند (تغییر `headers()` در `next.config.mjs`). تغییر `infra/prod/nginx.conf` روی مسیر لایو فعلی بی‌اثر است، چون Nginx در مدار نیست؛ آن تغییر برای حالت Self-hosted Compose نگه داشته می‌شود.
2. دستور `proxy_hide_header Link;` در `nginx.conf` **هشدار preload CSS را روی لایو برطرف نمی‌کند**. آن هشدار ناشی از ارسال همزمان هدر `Link: rel=preload` توسط استریم Next و تگ استایل درون HTML است و صرفاً Cosmetic است (بدون اثر بر سرعت یا خطای کاربر). رفع کامل آن نیازمند تنظیم Caddy در Coolify است و خارج از این شاخه است.
3. پس از دیپلوی، بدون Purge کش آروان، هدر قدیمی `max-age=0` ممکن است از لبه به کاربر برگردد و تصور «رفع نشدن مشکل» ایجاد کند. Purge بخشی از استقرار است، نه کاری اختیاری.

---

## ۱. پیش‌پرواز (Pre-flight) — روی سیستم لوکال، بدون اثر بر تولید

```bash
cd /Users/Mehdi/TaskDoon
git fetch origin
git switch feat/devops-stabilization-phase1
git status --short            # باید خالی باشد
git log --oneline -1          # 6672d62

npm run typecheck --workspace @taskin/web
npx tsc -b apps/api
npx vitest run --project api  # انتظار: ۲۸۱ تست پاس
docker compose -f docker-compose.prod.yml config -q && echo COMPOSE_OK
node --test infra/ci/trigger-coolify.test.mjs   # انتظار: ۶ از ۶
```

**دروازه‌های توقف:** اگر یکی از موارد زیر برقرار نبود، استقرار آغاز نشود:
- آخرین بک‌آپ سالم از ۲۴ ساعت گذشته قدیمی‌تر باشد.
- مانور بازیابی (`infra/prod/backup/test-restore-drill.sh`) در ۷ روز گذشته اجرا نشده باشد.
- شاخه `main` از زمان ساخت این شاخه تغییر ساختاری در `apps/api/src/platform/db` داشته باشد (نیاز به Rebase و اجرای مجدد تست‌ها).

---

## ۲. مسیر A — استقرار از طریق Coolify (مسیر واقعی لایو)

**ترتیب دقیق گام‌ها؛ هر گام دروازه گام بعد است.**

| # | گام | مسئول | معیار عبور | زمان تقریبی |
| :--- | :--- | :--- | :--- | :--- |
| A1 | Push شاخه و باز کردن PR به `main` | DevOps | CI سبز روی PR | ۲ دقیقه |
| A2 | Merge به `main` | مالک محصول (مهدی) | Merge commit روی `main` | — |
| A3 | اجرای خودکار `release.yml` → `verify` | GitHub Actions | CI سبز | ۸–۱۲ دقیقه |
| A4 | `publish` سه ایمیج با تگ `sha-<commit>` به GHCR | GitHub Actions | Digest ثبت‌شده برای api/web/worker | ۶–۱۰ دقیقه |
| A5 | **دروازه تایید دستی** روی `deploy` (`environment: production`) | مالک محصول | Approve در تب Actions | — |
| A6 | `promote` تگ‌های `:latest` | GitHub Actions | — | ۱ دقیقه |
| A7 | `deploy` → وبهوک Coolify با `COOLIFY_IMAGE_TAG=sha-…` | GitHub Actions | پذیرش وبهوک | < ۱ دقیقه |
| A8 | Build و استقرار در Coolify | Coolify | Healthcheck سرویس سبز | ۴–۸ دقیقه |
| A9 | Purge کش آروان برای `/fonts/*`، `/_next/static/*`، `/login` | DevOps | `x-cache: MISS` در اولین درخواست | ۲ دقیقه |
| A10 | اجرای چک‌لیست Smoke | DevOps | همه بندها PASS | ۱۰ دقیقه |

**نکته A6:** در وضعیت فعلی، `promote` هنوز دروازه تایید دستی ندارد (فقط `deploy` دارد). برای بستن این شکاف، پچ `infra/ci/release-workflow-update.patch` باید اعمال شود؛ این کار در گام A1 با دسترسی دارای اسکوپ `workflow` انجام می‌شود (توکن لوکال فعلی این اسکوپ را ندارد).

```bash
git apply --check infra/ci/release-workflow-update.patch && git apply infra/ci/release-workflow-update.patch
```

**پیش‌نیاز A7:** وجود `COOLIFY_WEBHOOK_URL` و `COOLIFY_API_TOKEN` در GitHub Secrets و `ARVAN_S3_*` برای بک‌آپ آف‌سایت — طبق `docs/devops/env-readiness-checklist.md`. بدون این‌ها انتشار تا `publish` پیش می‌رود و در `deploy` متوقف می‌شود (ایمیج‌ها ساخته و نگه داشته می‌شوند، تولید دست‌نخورده می‌ماند).

---

## ۳. مسیر B — استقرار با Docker Compose + Nginx (اگر سرور به Compose منتقل شد)

**هشدار قطعی:** `infra/prod/blue-green/cutover.sh` به upstreamهای `api_blue` (پورت ۴۰۰۱) و `api_green` (پورت ۴۰۰۲) اشاره می‌کند، اما `docker-compose.prod.yml` فقط یک سرویس `api` و یک `web` دارد و `nginx.conf` فقط upstreamهای `taskdoon_api`/`taskdoon_web` را می‌شناسد. بنابراین **این اسکریپت در وضعیت فعلی اجرا نمی‌شود** و نباید در پنجره انتشار به آن تکیه کرد.

دو گزینه، به ترتیب اولویت:

**B1 (توصیه‌شده) — تکمیل Blue/Green پیش از استفاده:**
1. افزودن سرویس‌های `api-blue`/`api-green` و `web-blue`/`web-green` با پورت‌های ۴۰۰۱/۴۰۰۲ به Compose.
2. افزودن `upstream api_blue { server 127.0.0.1:4001; }` و `upstream api_green { server 127.0.0.1:4002; }` به `nginx.conf` و `include /etc/nginx/conf.d/upstream_active.conf;` در بلوک `http`.
3. سپس: بالا آوردن رنگ غیرفعال → `./cutover.sh green` → تست Smoke → خاموش کردن رنگ قبلی.

**B2 (پل موقت، با قطعی چندثانیه‌ای):** استقرار رنگ‌بندی‌نشده در پنجره ترافیک کم:
```bash
docker compose -f docker-compose.prod.yml pull api web worker realtime
docker compose -f docker-compose.prod.yml up -d --no-deps api realtime worker web
```
`resolver 127.0.0.11 valid=10s` در Nginx باعث می‌شود IP جدید سرویس‌ها حداکثر تا ۱۰ ثانیه شناسایی شود؛ در این بازه چند درخواست ممکن است `502` بگیرند. فقط در بازه اعلام‌شده و با اطلاع مالک محصول.

---

## ۴. اعتبارسنجی پس از استقرار (Post-deploy Verification)

```bash
# ۱) کش فونت باید immutable باشد (هدف اصلی این انتشار)
curl -sSI https://taskdoone.ir/fonts/IRANYekanWebMedium.woff2 | grep -i "cache-control"
# انتظار: cache-control: public, max-age=31536000, immutable

curl -sSI https://taskdoone.ir/fonts/IRANYekanWebExtraBold.woff2 | grep -i "cache-control"
# انتظار: همان مقدار

# ۲) ریدایرکت مسیرهای ورود
curl -sSI https://taskdoone.ir/login  | head -1   # انتظار: 308 (Next) یا 302 (Nginx)
curl -sSI https://taskdoone.ir/signup | head -1   # انتظار: 308/302 → /feed
curl -sS -o /dev/null -w "%{http_code}\n" -L https://taskdoone.ir/login   # انتظار: 200

# ۳) سلامت سرویس‌ها و مسیرهای کلیدی
for p in / /feed /pricing /sitemap.xml /api/health; do
  printf "%s -> " "$p"; curl -sS -o /dev/null -w "%{http_code}\n" "https://taskdoone.ir$p";
done

# ۴) کش لبه پس از Purge باید MISS باشد، سپس HIT
curl -sSI https://taskdoone.ir/fonts/IRANYekanWebMedium.woff2 | grep -i "x-cache"
```

**دروازه شکست:** اگر `cache-control` همچنان `max-age=0` بود، به ترتیب بررسی شود: (۱) Purge کش آروان انجام شده؟ (۲) ایمیج مستقر واقعاً تگ `sha-…` جدید است؟ (۳) پاسخ مستقیم از مبدا (با Bypass کش آروان) چه هدری می‌دهد؟ تا روشن شدن مورد ۳، Rollback لازم نیست چون خطا صرفاً کارایی است.

---

## ۵. بازگشت سریع (Rollback)

**اصل:** بازگشت با ایمیج، نه با `git revert`. ایمیج‌های `sha-…` قبلی در GHCR می‌مانند.

| سطح | شرایط | اقدام | زمان تقریبی |
| :--- | :--- | :--- | :--- |
| **R1 — بازگشت ایمیج** | خطای ۵xx، شکست Healthcheck، رگرسیون رفتار | در Coolify تگ `sha-<commit قبلی>` را برای همان سرویس Deploy کن | ۳–۵ دقیقه |
| **R2 — بازگشت فایل پیکربندی** | خطا فقط در لبه (ریدایرکت/کش/هدر) | `git revert 6672d62` روی شاخه جدید → PR → همان مسیر A | ۲۰–۳۰ دقیقه |
| **R3 — بازگردانی دیتابیس** | فقط اگر داده آسیب دیده (در این انتشار انتظار نمی‌رود) | `docs/devops/runbooks/disaster-recovery.md` — بازیابی از آخرین دامپ سالم | RTO اندازه‌گیری‌شده: < ۴۲ ثانیه |

**پس از هر Rollback:** Purge کش آروان برای همان مسیرها الزامی است، وگرنه نسخه قدیمی در لبه می‌ماند. سپس Smoke Test دوباره اجرا شود.

**ممنوعیت‌ها:** بازگردانی دیتابیس هرگز به‌عنوان اولین واکنش؛ تغییر دستی فایل روی سرور بدون ثبت در گیت؛ حذف ایمیج‌های `sha-…` قدیمی تا ۳۰ روز.

---

## ۶. ریسک‌های شناخته‌شده این انتشار

| ریسک | اثر | کاهش |
| :--- | :--- | :--- |
| CDN آروان هدر قدیمی را نگه دارد | تصور رفع‌نشدن مشکل فونت | Purge اجباری در گام A9 + بررسی `x-cache` |
| نبود دروازه تایید روی `promote` | بازنویسی `:latest` بدون تایید | اعمال پچ در گام A1 |
| عدم تطابق Blue/Green با Compose | قطعی چندثانیه‌ای در مسیر B | گزینه B2 در پنجره کم‌ترافیک یا تکمیل B1 |
| هشدار preload CSS روی لبه Caddy | فقط نویز در کنسول مرورگر | پذیرش موقت؛ رفع در تنظیم Caddy با مجوز جداگانه |
| نبود کلیدهای Coolify/S3 | توقف خودکار در `deploy` | تولید دست‌نخورده می‌ماند؛ تکمیل چک‌لیست Env |

---

## ۷. تاییدیه‌های لازم پیش از اجرا

- [ ] مجوز صریح `git push` و Merge به `main` از مالک محصول
- [ ] وجود `COOLIFY_WEBHOOK_URL` و `COOLIFY_API_TOKEN` در GitHub Secrets
- [ ] وجود `ARVAN_S3_*` برای بک‌آپ آف‌سایت
- [ ] بک‌آپ سالم کمتر از ۲۴ ساعت
- [ ] پنجره انتشار اعلام‌شده (ترجیحاً خارج از ساعات اوج)
- [ ] آمادگی اجرای Rollback سطح R1
