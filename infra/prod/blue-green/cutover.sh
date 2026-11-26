#!/bin/sh
set -euo pipefail

# ==============================================================================
# TaskDoon Zero-Downtime Blue/Green Nginx Upstream Cutover Script
# Usage: ./cutover.sh [blue|green]
# Checks target upstream health first, then updates upstream config and reloads Nginx
# ==============================================================================

TARGET_COLOR="${1:-}"
if [ -z "${TARGET_COLOR}" ] || { [ "${TARGET_COLOR}" != "blue" ] && [ "${TARGET_COLOR}" != "green" ]; }; then
  echo "Usage: $0 [blue|green]"
  exit 1
fi

NGINX_CONTAINER="${NGINX_CONTAINER:-taskdoon-prod-nginx-1}"
TARGET_PORT=$([ "${TARGET_COLOR}" = "blue" ] && echo "4001" || echo "4002")
HEALTH_ENDPOINT="http://127.0.0.1:${TARGET_PORT}/api/health"

echo "[cutover] Verifying ${TARGET_COLOR} upstream health at ${HEALTH_ENDPOINT}..."

MAX_RETRIES=15
RETRY_DELAY=2
HEALTHY=0

for i in $(seq 1 ${MAX_RETRIES}); do
  if curl -fsS "${HEALTH_ENDPOINT}" >/dev/null 2>&1; then
    HEALTHY=1
    echo "[cutover] ${TARGET_COLOR} upstream is HEALTHY (attempt ${i}/${MAX_RETRIES})"
    break
  fi
  echo "[cutover] Waiting for ${TARGET_COLOR} to become healthy (attempt ${i}/${MAX_RETRIES})..."
  sleep ${RETRY_DELAY}
done

if [ "${HEALTHY}" -ne 1 ]; then
  echo "[cutover] ERROR: Target ${TARGET_COLOR} failed health check! Aborting cutover."
  exit 1
fi

echo "[cutover] Switching Nginx active upstream to ${TARGET_COLOR}..."
docker exec "${NGINX_CONTAINER}" sh -c "echo 'set \$upstream_api api_${TARGET_COLOR};' > /etc/nginx/conf.d/upstream_active.conf && nginx -s reload"

echo "[cutover] Cutover to ${TARGET_COLOR} completed successfully with ZERO DOWNTIME."
