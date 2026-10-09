# TaskDoon production containerization

Work from `/home/user/taskin`. This change is based on `origin/main` at `7f9c984`, on `feat/devops-phase1-containerization`.

## Build the three application targets

Docker Engine with BuildKit/Compose v2.24.4+ and Node 22 are required; OpenSSL creates the local TLS certificate. Allow roughly 6GB Docker memory during parallel builds.

```sh
cd /home/user/taskin
DOCKER_BUILDKIT=1 docker build --target runner -f apps/api/Dockerfile -t taskdoon-api:phase1 .
DOCKER_BUILDKIT=1 docker build --target migrator -f apps/api/Dockerfile -t taskdoon-migrator:phase1 .
DOCKER_BUILDKIT=1 docker build --target runner -f apps/web/Dockerfile -t taskdoon-web:phase1 .
```

Both Dockerfiles pin Node 22.23.3/Alpine3.24 by its multi-platform digest. Only root/workspace manifests enter installers; `npm ci` consumes the existing lockfile with a BuildKit npm cache. Builders copy the selected service and three shared packages explicitly. API production dependencies come from a separate clean `npm ci --omit=dev`; Web copies the Next standalone trace, public directory and static chunks in their monorepo-relative locations.

Build-only, version-pinned Binutils removes unused ELF debug/symbol sections from Node. Its dynamic symbols, ICU data and native-addon support are retained. The final `scratch` stages contain that Node binary, musl/runtime libraries, CA certificates, user records/licenses and production assets. They inherit no package managers or shell layers. `USER node` is UID 1000; production settings and bounded Node-fetch health probes are explicit. Direct Node commands plus Compose's init provide signal forwarding.

The API daemon excludes migration SQL and CLI code. The `migrator` target contains only its two compiled migration modules, SQL/journal and the locked `pg`/`drizzle-orm` dependency closure. Only this service receives `DATABASE_MIGRATOR_URL`. Existing development/scale Compose migration builds now select that target.

## Boot the local production-parity stack

Generate credentials once, before creating persistent volumes:

```sh
node infra/prod/init-local.mjs
sh infra/prod/init-tls.sh
docker compose --env-file .env.prod.local -f docker-compose.prod.yml config --quiet
DOCKER_BUILDKIT=1 docker compose --env-file .env.prod.local -f docker-compose.prod.yml up -d --build --wait --wait-timeout 180
docker compose --env-file .env.prod.local -f docker-compose.prod.yml ps
```

The generated environment and secret files are excluded from Git and build contexts. Their host parent directories are private; individual Compose file secrets are read-only and readable by the separate service UIDs. Every command must pass `--env-file .env.prod.local`; Compose does not auto-load that filename. Reuse these credentials when reusing volumes. Changing the environment alone does not rotate PostgreSQL or Redis persisted credentials.

Open `https://localhost:8443`. Object URLs use `https://storage.localhost:8443`. Trust the generated certificate for both hostnames in your local browser, or use a certificate issued by a locally trusted CA. Where localhost subdomain resolution is absent, add `127.0.0.1 storage.localhost` to the host's resolver configuration. The generated certificate expires after 30 days.

```sh
curl --cacert .local/prod/tls/server.crt https://localhost:8443/health/ready
curl --cacert .local/prod/tls/server.crt https://localhost:8443/tasks --output /dev/null
curl --cacert .local/prod/tls/server.crt --resolve storage.localhost:8443:127.0.0.1 https://storage.localhost:8443/status
docker compose --env-file .env.prod.local -f docker-compose.prod.yml exec api node -e "fetch('http://127.0.0.1:4000/health/ready').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

The generated Kavenegar placeholder proves startup/readiness only; it cannot deliver OTPs. Supply real provider credentials before generating the environment, or configure the generated environment for your approved SMS provider. Mailpit is an internal local SMTP sink. Production deployments use their own SMS/SMTP providers and valid TLS certificates.

The image build defaults compile `NEXT_PUBLIC_DATA_SOURCE=api`, an empty `NEXT_PUBLIC_RT_URL`, and nonsecret `TASKIN_API_ORIGIN=http://api:4000`. Next public variables and rewrite destinations are build-time values: rebuild when changing them. Runtime secrets are injected into API roles only. The TLS edge routes REST and Socket.IO directly to the matching service, keeping refresh cookies first-party and secure.

## Topology and operational boundaries

Only the TLS edge publishes a host port, bound to 127.0.0.1. PostgreSQL 16, PgBouncer, both Redis7 instances, object storage and application ports remain internal. Database/cache/storage/application networks are isolated. API roles have a separate outbound network for SMS/SMTP; the Web runner uses the internal application network.

PostgreSQL, RedisCore and SeaweedFS use distinct persistent named volumes. The prepared image directories preserve their non-root ownership on fresh Docker volumes. PostgreSQL readiness probes TCP so the temporary initialization server cannot satisfy migration dependencies. The fresh-volume bootstrap creates the same application/migrator/read-only platform roles as the existing stack.

Some historic migrations call `uuidv7()` without a schema. The PostgreSQL 16 bootstrap creates a restricted, invoker-only `public.uuidv7()` alias to migration0000's existing `app.uuidv7()` fallback. Its search path is fixed to `pg_catalog`; it grants execution to the application role and is owned by the migrator. Migrations 0000–0020 remain byte-for-byte unchanged. On servers 18+ the alias is not installed. This bootstrap is for fresh verification volumes, not an automatic upgrade procedure for an existing production database.

RedisCore has AOF/everysec, maxmemory 256MB and `noeviction` to protect BullMQ/session/idempotency data. Realtime Redis uses maxmemory 128MB and `volatile-lru`, with no persistence. Both leave memory headroom below their container limits and require generated passwords.

Every service runs under a nonzero UID, drops capabilities and sets no-new-privileges. Root filesystems are read-only with bounded writable tmpfs/data mounts. CPU, memory and PID limits apply to all services. JSON-file logs rotate at 20MB with 3 files. Nginx access logs omit query strings and raw referrers; error verbosity is restricted to critical events. Request IDs and status/duration support diagnosis without retaining presigned URL signatures. Upstreams use Docker DNS with shared zones to survive container IP changes. The storage virtual host preserves the signed Host, port and URI.

Stop while retaining data:

```sh
docker compose --env-file .env.prod.local -f docker-compose.prod.yml down
```

For a repeat migration, stop the existing migration job and run the same one-shot target:

```sh
docker compose --env-file .env.prod.local -f docker-compose.prod.yml run --rm migrate
```

## Verification evidence

See [verification.md](verification.md) for measured image layers, cache checks and boot results. Image history reports unpacked layer bytes; Docker Desktop/containerd `docker image inspect .Size` can include additional compressed-content storage accounting, so both measurements are reported separately.

The tests in this phase exercise actual images and services: build/lint/type checks, read-only non-root execution, native Argon2/Sharp, page/assets/health delivery, migration bootstrap/idempotence, network/resource/log settings, graceful shutdown and cache isolation. Existing test assertions and SQL migrations are unchanged.

On this Windows host, the requested checkout is inside WSL Ubuntu with Docker Desktop distro integration disabled. Builds use the real Linux checkout. Default file binds cannot reach that distro until integration is enabled. Verification therefore transferred the same configuration/secret files into isolated Docker volumes and applied an ignored local mount override; service images, commands, users, networks, resources and TLS behavior remained the delivered configuration. A normal Linux Docker host uses the boot commands above without that override.

Official references: [Node image guidance](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#smaller-images-without-npmyarn), [Next standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [BuildKit caching](https://docs.docker.com/build/cache/optimize/), [BullMQ production Redis policy](https://docs.bullmq.io/guide/going-to-production).
