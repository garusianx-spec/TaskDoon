Local Phase 4 live verification on Windows
=========================================

The API launcher is `native-live-api.mjs` beside this document. It starts only an
already built API. It does not create databases, apply migrations, run tests, or
start Docker. Its database checks reject the populated `taskin` database and
integration databases named `taskin_test_*`. It also refuses an occupied API port.

1. Root provisions a fresh database named `phase4_live_<random>` containing the
   latest migrated schema, owned by `taskin_migrator`, with database connect and
   temporary privileges for `taskin_app` and connect for `taskin_platform_admin`.
   Cloning the latest integration template is sufficient after its migration
   validation completes. Do not clone a database with populated development rows.

2. Build the API and live web, then set these variables in the same PowerShell
   environment from which the launcher and suites will run. Replace the example
   database name with the database root actually provisioned. None of these values
   need to be printed. The credentials below are the committed local-test roles.

   ```powershell
   $phase4Repo = 'C:\Users\garus\OneDrive\Desktop\taskin'
   $phase4Work = 'C:\Users\garus\Documents\Codex\2026-10-07\taskdoon\work'
   $phase4Db = 'phase4_live_REPLACE_WITH_CREATED_SUFFIX'
   $phase4Node = (Get-Command node).Source
   $env:DATABASE_URL = "postgres://taskin_app:taskin_app@127.0.0.1:5432/$phase4Db"
   $env:DATABASE_MIGRATOR_URL = "postgres://taskin_migrator:taskin_migrator@127.0.0.1:5432/$phase4Db"
   $env:DATABASE_PLATFORM_ADMIN_URL = "postgres://taskin_platform_admin:taskin_platform_admin@127.0.0.1:5432/$phase4Db"
   $env:REDIS_CORE_URL = 'redis://127.0.0.1:16379'
   $env:REDIS_RT_URL = 'redis://127.0.0.1:16380'
   $env:REDIS_PREFIX = $phase4Db
   $env:CHROMIUM_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
   $env:API_LOG = Join-Path $phase4Work "$phase4Db-api.log"
   $env:BASE_URL = 'http://localhost:3000'
   $env:TASKIN_API_ORIGIN = 'http://127.0.0.1:4000'
   $env:NEXT_PUBLIC_DATA_SOURCE = 'api'
   $env:GRANT_PLATFORM_ADMIN = '"{0}" "{1}" grant' -f $phase4Node, (Join-Path $phase4Repo 'apps\api\dist\cli\platform-admin.js')
   Set-Location -LiteralPath $phase4Repo
   npm run build --workspace @taskin/api
   npm run build --workspace @taskin/web
   ```

3. Start the launcher in a tracked shell session with the following command, or
   use `Start-Process` with `-WindowStyle Hidden` and redirected launcher logs.
   Arguments are separate PowerShell arguments; do not assemble shell code with
   database URLs. The helper reports only PID/readiness and writes a state JSON.

   ```powershell
   & $phase4Node (Join-Path $phase4Work 'native-live-api.mjs') $phase4Repo $env:API_LOG
   ```

   The helper configures `NODE_ENV=test`, `APP_ROLE=all`, port4000, JSON logs,
   deterministic public test encryption/OTP/signing material, false secure cookies,
   console SMS, memory mail, and enabled outbox relay/queue workers. Local Redis
   servers remain separate. Default S3 is port8333, bucket `taskin-files`, with
   committed development credentials. It waits up to60s for `/health/ready` and
   does not print OTP messages or connection URLs. The launcher's state JSON has
   the API PID and launcher PID. An API exit ends the launcher.

4. Start Next's built CLI directly with Node on port3000, using a separately
   tracked process/session, `-WindowStyle Hidden` for `Start-Process`, and log
   redirection. The CLI is `node_modules\next\dist\bin\next` at the repository
   root; launch with working directory `apps\web` and arguments `start -p 3000`.
   Poll `http://localhost:3000/feed` until200 and verify its HTML contains
   `data-source="api"`. All browser suites need `API_LOG` to exist before starting.

5. Run these seven suites sequentially from the repository root, preserving every
   original assertion. Keep the configured environment including the migrator URL
   so each suite's grant CLI affects the isolated database only.

   ```powershell
   npm run test:e2e:live --workspace @taskin/web
   npm run test:e2e:live:admin --workspace @taskin/web
   npm run test:e2e:live:password --workspace @taskin/web
   npm run test:e2e:live:moderation --workspace @taskin/web
   npm run test:e2e:live:workspace-moderation --workspace @taskin/web
   npm run test:e2e:live:agile --workspace @taskin/web
   npm run test:e2e:live:broadcasts --workspace @taskin/web
   ```

6. Stop only the owned Next port3000 process before changing `.next`, since live
   and demo builds share that directory. Build demo with
   `NEXT_PUBLIC_DATA_SOURCE=demo`, start the separately tracked Next process on
   port3100, set `BASE_URL=http://localhost:3100`, verify `/feed` has
   `data-source="demo"`, then run `npm run test:e2e --workspace @taskin/web`.
   Setting `BASE_URL` avoids the existing runner's POSIX process-group shutdown
   path, which is unsuitable for Windows. Keep `CHROMIUM_PATH` set.

7. Stop the owned API/Next processes by their captured PIDs after verification.
   Root may remove the dedicated database and only the owned Redis prefix after
   retaining results. Do not flush either Redis server or delete the shared S3
   bucket. Live upload object paths contain fresh workspace UUIDs; any object
   cleanup must use the exact workspace IDs created in this isolated run.

Read-only prerequisites confirmed: Node26.7.0 satisfies the API's >=22.12 engine;
Chrome exists at the configured path and Edge exists as a fallback; Docker CLI is
unnecessary for native application startup while the backing-service ports are
healthy. The launcher passed `node --check`; no launcher or live suite was run by
the planning subagent. Default throttles are preserved. If a suite receives429,
first inspect its response and wait for the documented rolling limit rather than
altering its assertions or silently loosening API limits.
