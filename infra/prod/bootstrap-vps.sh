#!/usr/bin/env bash
set -euo pipefail

readonly project_dir=/var/www/TaskDoon
readonly backup_dir=/var/backups/taskdoon
readonly compose_file="$project_dir/docker-compose.prod.yml"

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null || fail 'Install Docker Engine first.'
docker compose version >/dev/null || fail 'Install the Docker Compose plugin first.'
docker info >/dev/null || fail 'Start Docker and give this deployment account access to it.'
[[ -r "$project_dir/.env" ]] || fail "Create a readable production environment file at $project_dir/.env."
[[ -r "$compose_file" ]] || fail "Check out TaskDoon in $project_dir."

for file in redis-core.conf redis-rt.conf s3.json tls/server.crt tls/server.key; do
  [[ -f "$project_dir/.local/prod/$file" ]] || fail "Missing $project_dir/.local/prod/$file."
done

compose=(docker compose --project-directory "$project_dir" --env-file "$project_dir/.env" -f "$compose_file")
"${compose[@]}" config --quiet

if [[ ! -d "$backup_dir" || ! -O "$backup_dir" || ! -w "$backup_dir" ]]; then
  sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" -- "$backup_dir"
else
  chmod 0700 -- "$backup_dir"
fi

"${compose[@]}" up -d --build --wait web api realtime worker edge

cat <<'NEXT_STEPS'
Production services are running. Sign up the first administrator, then run:
read -r -p 'Signed-up Iranian mobile number: ' phone && docker compose --project-directory /var/www/TaskDoon --env-file /var/www/TaskDoon/.env -f /var/www/TaskDoon/docker-compose.prod.yml run --rm --no-deps -T migrate /usr/local/bin/node dist/cli/platform-admin.js grant "$phone"

Run one manual backup, then install the 03:00 job in this deployment account's crontab:
job='0 3 * * * /var/www/TaskDoon/infra/prod/backup-db.sh'; { (crontab -l 2>/dev/null || true) | { grep -Fxv -- "$job" || true; }; printf '%s\n' "$job"; } | crontab -
NEXT_STEPS
