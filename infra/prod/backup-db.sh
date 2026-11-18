#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly project_dir=/var/www/TaskDoon
readonly backup_dir=/var/backups/taskdoon

install -d -m 0700 -- "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$backup_dir/taskin-$timestamp.sql.gz"
partial=$(mktemp -- "$backup_dir/.taskin-$timestamp.XXXXXX")
trap 'rm -f -- "$partial"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

docker compose --project-directory "$project_dir" --env-file "$project_dir/.env" \
  -f "$project_dir/docker-compose.prod.yml" exec -T postgres sh -ec '
    export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
    exec pg_dump --no-password --host=127.0.0.1 --username="${POSTGRES_USER:?POSTGRES_USER is required}" --dbname=taskin
  ' | gzip -c > "$partial"

# gzip itself produces headers and a trailer even when pg_dump emits zero bytes.
bytes=$(gzip -dc -- "$partial" | wc -c)
if (( bytes == 0 )); then
  printf 'PostgreSQL backup contains no SQL.\n' >&2
  exit 1
fi

# Publish only the validated dump. An existing file for this timestamp stays intact.
ln -T -- "$partial" "$backup"
find "$backup_dir" -maxdepth 1 -type f \
  -name 'taskin-????????T??????Z.sql.gz' ! -newermt '7 days ago' -delete
printf 'PostgreSQL backup complete: %s\n' "$backup"
