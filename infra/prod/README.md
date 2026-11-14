# Production PostgreSQL backups

Run the backup as the Linux account that deploys TaskDoon. It needs Docker Compose access, read access to `/var/www/TaskDoon/.env`, and write access to `/var/backups/taskdoon`. Create the backup directory with mode `0700` and give that account ownership before enabling cron. Backups contain application data and are written with mode `0600`.

The script connects to the `postgres` Compose service and dumps the `taskin` database. It uses the PostgreSQL credentials passed to the container from the production `.env`. Dumps are named in UTC. Only validated, nonempty dumps are published. Successful runs remove TaskDoon dumps older than seven days.

## Schedule

Run `bash -n /var/www/TaskDoon/infra/prod/backup-db.sh` and perform one manual backup before installing the schedule. Add this line with `crontab -e` on the deployment account. Cron runs at 03:00 in the host cron daemon’s timezone. Set that timezone to `Asia/Tehran` if 03:00 should be Tehran time.

```cron
0 3 * * * /var/www/TaskDoon/infra/prod/backup-db.sh
```

## Restore

Use an empty `taskin` database in the destination stack with the TaskDoon database roles already provisioned. If replacing a live database, stop application writers and prepare the empty destination during maintenance. Substitute the actual backup filename below. The restore verifies the gzip archive before streaming SQL, stops on the first SQL error, and runs in one transaction.

```bash
backup=/var/backups/taskdoon/taskin-YYYYMMDDTHHMMSSZ.sql.gz; (set -o pipefail; gzip -t -- "$backup" && gzip -dc -- "$backup" | docker compose --project-directory /var/www/TaskDoon --env-file /var/www/TaskDoon/.env -f /var/www/TaskDoon/docker-compose.prod.yml exec -T postgres sh -ec 'export PGPASSWORD="${POSTGRES_PASSWORD:?}"; exec psql --no-password --no-psqlrc --host=127.0.0.1 --username="${POSTGRES_USER:?}" --dbname=taskin --single-transaction --set=ON_ERROR_STOP=1')
```

The dump covers PostgreSQL application data. Cluster-wide roles and object-storage files require their own recovery procedures.
