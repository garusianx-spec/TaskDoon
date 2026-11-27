#!/bin/sh
set -eu

BACKUP_DIR="/backups"
DB_NAME="${PGDATABASE:-taskin}"
DB_USER="${POSTGRES_USER:-taskin_migrator}"
DB_HOST="${PGHOST:-postgres}"
DB_PORT="${PGPORT:-5432}"
RETENTION_DAYS=7

perform_backup() {
  TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
  BACKUP_FILE="${BACKUP_DIR}/taskin_backup_${TIMESTAMP}.dump"
  PARTIAL_FILE="${BACKUP_FILE}.partial"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting database backup for '${DB_NAME}'..."

  pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -Fc > "${PARTIAL_FILE}"

  if pg_restore --list "${PARTIAL_FILE}" > /dev/null 2>&1; then
    mv "${PARTIAL_FILE}" "${BACKUP_FILE}"
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup completed successfully: ${BACKUP_FILE} ($(wc -c < "${BACKUP_FILE}") bytes)"
  else
    rm -f "${PARTIAL_FILE}"
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ERROR: Backup verification failed. Partial file removed." >&2
    return 1
  fi

  # Prune backups older than RETENTION_DAYS
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Pruning local backups older than ${RETENTION_DAYS} days..."
  find "${BACKUP_DIR}" -type f -name "taskin_backup_*.dump" -mtime "+${RETENTION_DAYS}" -delete || true

  # Optional S3 offsite sync if tools and credentials are present
  if [ -n "${S3_BACKUP_BUCKET:-}" ] && [ -n "${S3_BACKUP_ENDPOINT:-}" ]; then
    if command -v aws >/dev/null 2>&1; then
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Syncing backup to S3 bucket ${S3_BACKUP_BUCKET}..."
      aws --endpoint-url="${S3_BACKUP_ENDPOINT}" s3 cp "${BACKUP_FILE}" "s3://${S3_BACKUP_BUCKET}/$(basename "${BACKUP_FILE}")" || echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] WARNING: S3 sync failed." >&2
    elif command -v rclone >/dev/null 2>&1; then
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Syncing backup via rclone..."
      rclone copy "${BACKUP_FILE}" "remote:${S3_BACKUP_BUCKET}/" || echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] WARNING: rclone sync failed." >&2
    else
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] S3 offsite bucket configured, but neither 'aws' nor 'rclone' is installed in this container. Local backup retained."
    fi
  fi
}

if [ "${1:-}" = "--once" ]; then
  perform_backup
  exit 0
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Automated backup daemon started. Scheduled for 03:30 UTC daily."
while true; do
  CURRENT_TIME=$(date -u +"%H:%M")
  if [ "${CURRENT_TIME}" = "03:30" ]; then
    perform_backup || true
    sleep 65
  fi
  sleep 30
done
