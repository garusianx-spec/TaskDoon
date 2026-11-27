#!/bin/sh
set -euo pipefail

# ==============================================================================
# TaskDoon S3 Object Storage Incremental Offsite Sync Script
# Runs inside the backup sidecar or host cron
# Syncs SeaweedFS /data volume to an offsite S3-compatible remote
# ==============================================================================

SRC_DIR="${SEAWEED_DATA_DIR:-/s3-data}"
DEST_REMOTE="${OFFSITE_S3_REMOTE:-offsite-backup:taskdoon-files}"
LOG_PREFIX="[s3-sync $(date -u +'%Y-%m-%dT%H:%M:%SZ')]"

echo "${LOG_PREFIX} Starting SeaweedFS incremental offsite sync..."

if [ ! -d "${SRC_DIR}" ]; then
  echo "${LOG_PREFIX} Source directory ${SRC_DIR} not found. Skipping."
  exit 0
fi

# Run incremental sync using rclone if available, otherwise notify
if command -v rclone >/dev/null 2>&1; then
  rclone sync "${SRC_DIR}" "${DEST_REMOTE}" \
    --fast-list \
    --transfers 4 \
    --checkers 8 \
    --exclude "lost+found/**" \
    --exclude "*.tmp" \
    --log-level NOTICE
  echo "${LOG_PREFIX} Incremental sync completed successfully."
else
  echo "${LOG_PREFIX} Notice: rclone not installed. Local file count: $(find "${SRC_DIR}" -type f | wc -l)"
fi
