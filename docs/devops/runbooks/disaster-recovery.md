# دستورالعمل جامع بازیابی پس از سانحه (Disaster Recovery Runbook)
## سامانه سازمانی تسک‌دون (TaskDoon)

- **سطح بحران:** P0 / Critical
- **اهداف عملیاتی:** RPO ≤ 15 Minutes | RTO ≤ 30 Minutes
- **تاریخ بازبینی:** نوامبر ۲۰۲۶
- **مرجع اجرا:** تیم DevOps و SRE تسک‌دون

---

## ۱. پیش‌نیازها و اطلاعات کلیدی

### ۱.۱. سرویس‌ها و ولوم‌های داده
| سرویس | نوع داده | نام ولوم Docker | مسیر داده در کانتینر |
| :--- | :--- | :--- | :--- |
| **PostgreSQL 16** | جداول، متادیتا، لاگ مایگریشن | `postgresdata` | `/var/lib/postgresql/data` |
| **Redis Core** | صف‌های BullMQ، نشست‌ها، کش ماندگار | `redis-core-data` | `/data` |
| **SeaweedFS S3** | فایل‌ها، ضمایم، آواتارها | `s3data` | `/data` |
| **DB Backup** | آرشیو فشرده و تاییدشده دامپ‌ها | `db-backups` | `/backups` |

### ۱.۲. مکان ذخیره‌سازی نسخه‌های پشتیبان
- **لوکال روی سرور:** `/var/lib/docker/volumes/taskdoon-prod_db-backups/_data/`
- **استوریج ابری ثانویه (Offsite):** باکت S3 پشتیبان خارج از هاست اصلی

---

## ۲. سناریوهای بازیابی (Recovery Scenarios)

### سناریو ۱: آسیب به پایگاه داده یا پاک شدن ناخواسته جداول
اگر کانتینر PostgreSQL سالم است اما داده‌ها دچار آسیب منطقی یا حذف تصادفی شده‌اند:

```bash
# گام ۱: متوقف ساختن سرویس‌های ترافیک‌گیر جهت جلوگیری از نوشتن داده جدید
docker compose -f docker-compose.prod.yml stop api web realtime worker

# گام ۲: یافتن آخرین نسخه معتبر و تاییدشده پشتیبان
BACKUP_FILE=$(docker exec taskdoon-prod-db-backup-1 ls -1t /backups/taskin_*.dump.gz | head -n 1)
echo "Selected backup: ${BACKUP_FILE}"

# گام ۳: بازنشانی ساختار و بازیابی پایگاه داده
docker exec -i taskdoon-prod-postgres-1 psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'taskin' AND pid <> pg_backend_pid();"
docker exec -i taskdoon-prod-postgres-1 dropdb -U postgres --if-exists taskin
docker exec -i taskdoon-prod-postgres-1 createdb -U postgres -O taskin_migrator taskin

# گام ۴: بازیابی داده‌ها با استفاده از pg_restore
docker exec -i taskdoon-prod-postgres-1 bash -c "gunzip -c ${BACKUP_FILE} | pg_restore -U postgres -d taskin --clean --if-exists --no-owner --role=taskin_migrator"

# گام ۵: اعتبارسنجی مایگریشن‌ها و اصلاح جدول ژورنال
docker compose -f docker-compose.prod.yml run --rm migrate

# گام ۶: بالا آوردن مجدد سرویس‌ها
docker compose -f docker-compose.prod.yml start api web realtime worker

# گام ۷: اعتبارسنجی سلامت سامانه
curl -fsS https://taskdoone.ir/api/health
```

---

### سناریو ۲: خرابی کامل هاست / سرور و راه‌اندازی روی سرور جدید (Bare-metal / New VPS)

```bash
# گام ۱: دریافت آخرین نسخه کد از مخزن گیت‌هاب
git clone https://github.com/garusianx-spec/TaskDoon.git
cd TaskDoon
git checkout main

# گام ۲: انتقال فایل متغیرهای محیطی رمزنگاری‌شده (.env.prod)
# متغیرها باید از Password Manager امن (مانند Bitwarden / 1Password تیم) بارگذاری شوند.
test -f .env.prod || { echo "ERROR: .env.prod is missing!"; exit 1; }

# گام ۳: ایجاد ولوم‌ها و آماده‌سازی مجوزهای امنیتی (Non-Root)
docker volume create taskdoon-prod_postgresdata
docker volume create taskdoon-prod_redis-core-data
docker volume create taskdoon-prod_s3data
docker volume create taskdoon-prod_db-backups

# گام ۴: بازیابی آخرین نسخه بک‌آپ از استوریج ابری ثانویه به ولوم بک‌آپ
# (استفاده از rclone یا aws-cli)
rclone copy offsite-backup:taskdoon-db-backups/latest.dump.gz /var/lib/docker/volumes/taskdoon-prod_db-backups/_data/

# گام ۵: اجرای مرحله‌ای کانتینرها
docker compose -f docker-compose.prod.yml up -d postgres redis-core redis-rt s3 s3-init
docker compose -f docker-compose.prod.yml run --rm db-backup-init

# گام ۶: بازگردانی دیتابیس
# اجرای دستورات سناریو ۱

# گام ۷: راه‌اندازی کامل استک
docker compose -f docker-compose.prod.yml up -d
```

---

## ۳. چک‌لیست اعتبارسنجی پس از بازیابی (Post-Recovery Checklist)
- [ ] وضعیت اندپوینت سلامت عمومی: `HTTP 200 OK` روی `https://taskdoone.ir/api/health`
- [ ] اتصال وب‌سوکت لایو: اتصال Socket.IO بدون خطای ۴۰۱ یا ۵۰۲
- [ ] بررسی کوئری مایگریشن‌ها در PostgreSQL:
  ```sql
  SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id DESC LIMIT 5;
  ```
- [ ] صف‌های BullMQ در Redis Core: کلیدهای صف `bull:*` فعال بوده و جاب‌های تکراری معلق نباشند.
- [ ] دسترسی به فایل‌های آپلودشده قبلی در SeaweedFS بدون خطای ۴۰۴ یا امضای نامعتبر.

---

## ۴. برنامه مانور دوره‌ای بازیابی (DR Drill Schedule)
- **دوره برگزاری:** پایان هر فصل (هر ۹۰ روز یک بار).
- **محیط مانور:** سرور تستی ایزوله (Staging)، با دیتای ماسک‌شده (Sanitized).
- **شاخص موفقیت:** زمان بازگردانی کمتر از ۲۰ دقیقه و صفر درصد نشت داده بین مستاجران.
