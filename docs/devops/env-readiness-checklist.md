# چک‌لیست آمادگی متغیرهای محیطی زیرساخت (Environment Readiness Checklist)
## پلتفرم سازمانی تسک‌دون (TaskDoon)

- **هدف:** آماده‌سازی و اتصال آنی زیرساخت به محض دریافت کلیدها از مالک محصول (مهدی)
- **محیط هدف:** Production VPS (Coolify Host) / Docker Compose
- **تاریخ تنظیم:** ۵ آذر ۱۴۰۵ (۲۵ نوامبر ۲۰۲۶)
- **وضعیت:** در انتظار دریافت کلیدها (Pending Owner Input)

---

## ۱. متغیرهای اولویت بالا (کلیدهای بیرونی موردنیاز از مهدی)

| نام متغیر (Env Key) | سرویس مقصد | دامنه استفاده | توضیحات و فرمت نمونه | وضعیت |
| :--- | :--- | :--- | :--- | :---: |
| `ARVAN_S3_ACCESS_KEY` | ابر آروان | پشتیبان‌گیری آف‌سایت SeaweedFS | کلید دسترسی باکت S3 آروان (مثلاً: `ak-xxxx-xxxx`) | ⏳ در انتظار |
| `ARVAN_S3_SECRET_KEY` | ابر آروان | پشتیبان‌گیری آف‌سایت SeaweedFS | کلید محرمانه باکت S3 آروان | ⏳ در انتظار |
| `ARVAN_S3_ENDPOINT` | ابر آروان | اسکریپت `s3-sync.sh` | آدرس اندپوینت S3 آروان (`https://s3.ir-thr-at1.arvanstorage.ir`) | ⏳ در انتظار |
| `ARVAN_S3_BUCKET` | ابر آروان | باکت مقصد بک‌آپ | نام باکت اختصاصی (پیشنهاد: `taskdoon-offsite-backups`) | ⏳ در انتظار |
| `COOLIFY_WEBHOOK_URL` | Coolify | پایپ‌لاین CI/CD در GitHub Secrets | وبهوک تریگر بیلد و دیپلوی سرویس در داشبورد Coolify | ⏳ در انتظار |
| `COOLIFY_API_TOKEN` | Coolify | اسکریپت `trigger-coolify.mjs` | توکن احراز هویت API داشبورد Coolify | ⏳ در انتظار |
| `PAYMENT_MERCHANT_ID` | زرین‌پال / درگاه | صدور فاکتور و پرداخت اشتراک | شناسه درگاه مرچنت ۳۶ کاراکتری زرین‌پال یا سداد | ⏳ در انتظار |
| `PAYMENT_CALLBACK_URL` | درگاه پرداخت | بازگشت پس از تراکنش مالی | آدرس کالبک عمومی (`https://taskdoone.ir/api/v1/billing/callback`) | ⏳ در انتظار |

---

## ۲. متغیرهای هسته امنیت و داده (Core Production Secrets)

| نام متغیر | سرویس | نقش امنیتی | مقدار پیش‌فرض / استاندارد |
| :--- | :--- | :--- | :--- |
| `TASKIN_APP_PASSWORD` | PostgreSQL | اتصال DML روزمره اپلیکیشن از طریق PgBouncer | رمز تصادفی ۳۲ کاراکتری قوی |
| `TASKIN_MIGRATOR_PASSWORD` | PostgreSQL | اجرای مایگریشن‌های ساختاری DDL | رمز تصادفی ۳۲ کاراکتری قوی |
| `TASKIN_PLATFORM_ADMIN_PASSWORD` | PostgreSQL | دسترسی مانیتورینگ صادرکننده پرومتیوس | رمز تصادفی با دسترسی فقط‌خواندنی |
| `POSTGRES_PASSWORD` | PostgreSQL | کاربر روت داخلی سرور دیتابیس | رمز ادمین دیتابیس |
| `REDIS_CORE_PASSWORD` | Redis Core | رمز احراز هویت صف‌های BullMQ و کش دیسکی | رمز ۳۲ کاراکتری در secret فایل |
| `REDIS_RT_PASSWORD` | Redis RT | رمز نشست‌های وب‌سوکت موقت | رمز ۳۲ کاراکتری |
| `JWT_PRIVATE_JWKS` | API Auth | امضا و اعتبارسنجی توکن‌های سشن کاربران | JSON Web Key Set استاندارد |
| `OTP_PEPPER` | Auth / SMS | رشته پپر یکتا جهت هش کردن کدهای یک‌بارمصرف | رشته امن تصادفی (حداقل ۶۴ کاراکتر) |
| `APP_ENCRYPTION_KEY` | Core DB | رمزنگاری فیلدهای حساس و کلیدهای ادغام | کلید هگز ۳۲ بایتی (AES-256-GCM) |
| `KAVENEGAR_API_KEY` | پیامک | ارسال پیامک ورود، دعوت و اعلان‌ها | توکن API کاوه‌نگار |

---

## ۳. دستورالعمل تزریق امن و راستی‌آزمایی به محض دریافت

```bash
# ۱. اعتبارسنجی ارتباط با باکت S3 ابر آروان به محض تنظیم کلیدها:
AWS_ACCESS_KEY_ID="${ARVAN_S3_ACCESS_KEY}" \
AWS_SECRET_ACCESS_KEY="${ARVAN_S3_SECRET_KEY}" \
aws --endpoint-url="${ARVAN_S3_ENDPOINT}" s3 ls "s3://${ARVAN_S3_BUCKET}"

# ۲. تست صحت فراخوانی وبهوک Coolify با کامیت تگ تستی:
curl -X POST "${COOLIFY_WEBHOOK_URL}" \
  -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
  -H "Content-Type: application/json"

# ۳. تست سلامت درگاه پرداخت (Sandbox Ping):
curl -fsS -X POST https://api.zarinpal.com/pg/v4/payment/request.json \
  -H "Content-Type: application/json" \
  -d "{\"merchant_id\":\"${PAYMENT_MERCHANT_ID}\",\"amount\":10000,\"callback_url\":\"${PAYMENT_CALLBACK_URL}\",\"description\":\"تست سلامت درگاه تسک‌دون\"}"
```
