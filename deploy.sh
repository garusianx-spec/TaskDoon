#!/bin/bash
set -e
cd /var/www/TaskDoon

echo "1/4 Checking .env critical settings..."
grep -q "^PUBLIC_WEB_ORIGIN=https://taskdoone.ir" .env || { echo "ERROR: PUBLIC_WEB_ORIGIN is not https://taskdoone.ir"; exit 1; }
grep -q "^SMS_PROVIDERS=smsir" .env || { echo "ERROR: SMS_PROVIDERS is not smsir"; exit 1; }
grep -q "^SMSIR_API_KEY=.\+" .env || { echo "ERROR: SMSIR_API_KEY is missing"; exit 1; }
grep -q "^SMSIR_OTP_TEMPLATE_ID=.\+" .env || { echo "ERROR: SMSIR_OTP_TEMPLATE_ID is missing"; exit 1; }
grep -q "^NEXT_PUBLIC_GA_ID=.\+" .env || { echo "ERROR: NEXT_PUBLIC_GA_ID is missing"; exit 1; }

echo "2/4 Pulling latest code from main..."
git pull origin main

echo "3/4 Building and updating containers..."
docker compose -f docker-compose.prod.yml up -d --build web api realtime worker
docker compose -f docker-compose.prod.yml restart edge

echo "4/4 Verifying live health..."
sleep 3
curl -fsSk https://127.0.0.1/api/v1/public/site/settings > /dev/null
echo "Deploy and health check completed successfully!"