#!/bin/sh
set -euo pipefail

# ==============================================================================
# TaskDoon Routine PostgreSQL Off-Peak Maintenance Script
# Runs non-blocking VACUUM ANALYZE to reclaim dead tuples and update planner stats
# Recommended schedule: Weekly at 04:00 AM off-peak
# ==============================================================================

PG_CONTAINER="${POSTGRES_CONTAINER:-taskdoon-prod-postgres-1}"
PG_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-taskin}"

LOG_PREFIX="[vacuum-maintenance $(date -u +'%Y-%m-%dT%H:%M:%SZ')]"

echo "${LOG_PREFIX} Initiating off-peak non-blocking VACUUM ANALYZE for database '${DB_NAME}'..."

docker exec -i "${PG_CONTAINER}" psql -U "${PG_USER}" -d "${DB_NAME}" -v "ON_ERROR_STOP=1" <<'SQL'
-- Update optimizer statistics and reclaim dead space without table locks
VACUUM (ANALYZE, VERBOSE);
SQL

echo "${LOG_PREFIX} Routine maintenance successfully finished."
