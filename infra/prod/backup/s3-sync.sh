#!/bin/sh
set -euo pipefail

# ==============================================================================
# TaskDoon S3 Object Storage Incremental Offsite Sync Script
# Runs inside the backup sidecar, host cron, or maintenance routine.
# Syncs SeaweedFS /data volume or local DB dumps to ArvanCloud / S3 bucket.
# ==============================================================================

SRC_DIR="${SEAWEED_DATA_DIR:-/s3-data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
LOG_PREFIX="[s3-sync $(date -u +'%Y-%m-%dT%H:%M:%SZ')]"

# Fallback: Support both ARVAN_S3_* and standard S3_* / AWS_* naming
ACCESS_KEY="${ARVAN_S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-${S3_ACCESS_KEY:-}}}"
SECRET_KEY="${ARVAN_S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-${S3_SECRET_KEY:-}}}"
ENDPOINT="${ARVAN_S3_ENDPOINT:-${S3_BACKUP_ENDPOINT:-https://s3.ir-thr-at1.arvanstorage.ir}}"
BUCKET="${ARVAN_S3_BUCKET:-${S3_BACKUP_BUCKET:-taskdoon-offsite-backups}}"

if [ -z "${ACCESS_KEY}" ] || [ -z "${SECRET_KEY}" ]; then
  echo "${LOG_PREFIX} Waiting for credentials: ARVAN_S3_ACCESS_KEY and ARVAN_S3_SECRET_KEY not set. Offsite sync skipped."
  exit 0
fi

echo "${LOG_PREFIX} Preparing S3 offsite synchronization targeting ${ENDPOINT}/${BUCKET}..."

# Automatic wiring for rclone via environment variables (no config file needed)
export RCLONE_CONFIG_ARVAN_TYPE="s3"
export RCLONE_CONFIG_ARVAN_PROVIDER="Other"
export RCLONE_CONFIG_ARVAN_ENV_AUTH="false"
export RCLONE_CONFIG_ARVAN_ACCESS_KEY_ID="${ACCESS_KEY}"
export RCLONE_CONFIG_ARVAN_SECRET_ACCESS_KEY="${SECRET_KEY}"
export RCLONE_CONFIG_ARVAN_ENDPOINT="${ENDPOINT}"
export RCLONE_CONFIG_ARVAN_ACL="private"

if command -v rclone >/dev/null 2>&1; then
  # 1. Sync SeaweedFS User Uploads / Files
  if [ -d "${SRC_DIR}" ]; then
    echo "${LOG_PREFIX} Syncing SeaweedFS data directory (${SRC_DIR})..."
    rclone sync "${SRC_DIR}" "arvan:${BUCKET}/files/" \
      --fast-list \
      --transfers 4 \
      --checkers 8 \
      --exclude "lost+found/**" \
      --exclude "*.tmp" \
      --log-level NOTICE
  fi

  # 2. Sync Database Binary Dumps
  if [ -d "${BACKUP_DIR}" ]; then
    echo "${LOG_PREFIX} Syncing Database binary dumps (${BACKUP_DIR})..."
    rclone copy "${BACKUP_DIR}" "arvan:${BUCKET}/db-backups/" \
      --include "taskin_backup_*.dump" \
      --log-level NOTICE
  fi

  echo "${LOG_PREFIX} S3 offsite sync completed successfully."
elif command -v aws >/dev/null 2>&1; then
  export AWS_ACCESS_KEY_ID="${ACCESS_KEY}"
  export AWS_SECRET_ACCESS_KEY="${SECRET_KEY}"
  
  if [ -d "${BACKUP_DIR}" ]; then
    for dump in "${BACKUP_DIR}"/taskin_backup_*.dump; do
      if [ -f "${dump}" ]; then
        aws --endpoint-url="${ENDPOINT}" s3 cp "${dump}" "s3://${BUCKET}/db-backups/$(basename "${dump}")"
      fi
    done
  fi
  echo "${LOG_PREFIX} S3 offsite sync via AWS CLI completed."
else
  echo "${LOG_PREFIX} Notice: rclone/aws not found in current path. S3 configuration is valid and waiting for runner."
fi
