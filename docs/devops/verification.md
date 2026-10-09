# Phase 1 container verification

Verified in `/home/user/taskin` on `feat/devops-phase1-containerization`, based on freshly fetched `origin/main` (`7f9c984`). No commits to main or pushes were made. Existing migration and test files remain unchanged.

## Exact image sizes

Measurements are for Linux/amd64. Unpacked layer bytes are Engine history values; Docker Desktop/containerd inspect includes additional content storage. Decimal MB means bytes divided by 1,000,000.

| Image | Unpacked layer bytes | Decimal MB | Docker inspect storage bytes |
|---|---:|---:|---:|
| taskdoon-api:phase1 | 234,405,888 | 234.405888 | 292,912,155 |
| taskdoon-web:phase1 | 174,915,584 | 174.915584 | 234,875,122 |
| taskdoon-migrator:phase1 | 124,186,624 | 124.186624 | 169,492,621 |

Web remains above the requested 150 MB aim. Its stripped Node/runtime layer is approximately 117.7 MB; native Sharp/libvips and Next server assets account for most of the remainder. Unused compiler bundles, foreign-libc native binaries, type/source maps and debug ELF sections were removed. Image optimization, Persian/ICU support and native addons were verified.

## taskdoon-api:phase1

Local reference ID: `sha256:a142cf4347cde786c02bc399a39ad2690bf0cce8a5260b1cd2b650f542e70b99`

| Filesystem layer, bottom to top | Exact bytes |
|---|---:|
| `COPY /runtime-root /` | 117,710,848 |
| `WORKDIR /repo/apps/api` | 16,384 |
| `COPY --chown=node:node /repo/node_modules /repo/node_modules` | 114,475,008 |
| `COPY --chown=node:node /repo/apps/api/node_modules ./node_modules` | 417,792 |
| `COPY --chown=node:node /runtime/packages /repo/packages` | 147,456 |
| `COPY --chown=node:node /runtime/apps/api ./` | 1,638,400 |

Configuration-only instructions (ENV, USER, CMD, EXPOSE, HEALTHCHECK) add zero filesystem bytes. Runtime USER is `node`; NODE_ENV is production.

## taskdoon-web:phase1

Local reference ID: `sha256:88b579bf7a703afe82a2709c90de50b3a63f739a344a26ac22281803a91fe806`

| Filesystem layer, bottom to top | Exact bytes |
|---|---:|
| `COPY /runtime-root/ /` | 117,706,752 |
| `WORKDIR /app` | 4,096 |
| `COPY --chown=node:node /app/apps/web/.next/standalone ./` | 55,169,024 |
| `COPY --chown=node:node /app/apps/web/public ./apps/web/public` | 77,824 |
| `COPY --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static` | 1,957,888 |

Configuration-only instructions (ENV, USER, CMD, EXPOSE, HEALTHCHECK) add zero filesystem bytes. Runtime USER is `node`; NODE_ENV is production.

## taskdoon-migrator:phase1

Local reference ID: `sha256:c99b732654d538b56f57f59e8a1b5814f9446857f21d0c0fe93b10f60d8984f5`

| Filesystem layer, bottom to top | Exact bytes |
|---|---:|
| `COPY /runtime-root /` | 117,710,848 |
| `WORKDIR /repo/apps/api` | 16,384 |
| `COPY --chown=node:node /migration-runtime/node_modules /repo/node_modules` | 6,115,328 |
| `COPY --chown=node:node /migration-runtime/apps/api/node_modules ./node_modules` | 20,480 |
| `COPY --chown=node:node /runtime/apps/api/package.json ./package.json` | 20,480 |
| `COPY --chown=node:node /repo/apps/api/dist/cli/migrate.js ./dist/cli/migrate.js` | 28,672 |
| `COPY --chown=node:node /repo/apps/api/dist/platform/db/migrate.js ./dist/platform/db/migrate.js` | 32,768 |
| `COPY --chown=node:node apps/api/db/migrations/*.sql ./db/migrations/` | 208,896 |
| `COPY --chown=node:node apps/api/db/migrations/meta/_journal.json ./db/migrations/meta/_journal.json` | 32,768 |

Configuration-only instructions (ENV, USER, CMD, EXPOSE, HEALTHCHECK) add zero filesystem bytes. Runtime USER is `node`; NODE_ENV is production.

## Results

- All three targets built with BuildKit, pinned base digest and locked npm dependencies.
- API compiled TypeScript. Next build passed compilation, lint and type checks, generating 23 routes.
- API bootstrap imports and real Argon2 hash/verify passed with read-only rootfs, no capabilities, no-new-privileges and UID 1000.
- Web: 21 page/probe/icon routes returned 200; missing-page behavior returned 404. Static JS/font assets, RTL markup, Sharp and actual Next image optimization passed.
- No shell, npm/npx/corepack/yarn/apk, TypeScript sources/compiler or native build sources enter application runners. Web optional SWC/Webpack/Babel compilers were removed. Node licenses and library symlinks remain.
- Deterministic Web build ID hashes selected sources/config/manifests/public inputs and explicit public variables; secrets and .env files are excluded. Cold-build timestamps/provenance are not claimed bit-identical.
- API cache probe: all 28 COPY/RUN steps cached despite unrelated Web source. Migrator warm build: 31 cached steps. Web cache probe: 29 cached steps despite unrelated API source. Runtime configuration/filesystem layers stayed identical; provenance index metadata may differ.
- Fresh PostgreSQL 16.15 bootstrap installed roles and compatibility alias, then applied all 21 historic migrations and seeded 3 plans. Repeat migration completed with no duplicate migrations/plans.
- UUIDv7 layout and role privilege split verified. Platform admin remains BYPASSRLS with default_transaction_read_only=on; application role is neither superuser nor BYPASSRLS.
- Main stack: 11 long-running services healthy and both one-shot jobs exited 0. Actual processes use nonzero UIDs. All 13 services have read-only roots, capability drops, no-new-privileges, CPU/memory/PID limits and 20 MB/3-file JSON log rotation.
- Database/cache/storage/application networks are internal. Only TLS edge binds 127.0.0.1:8443; backends publish no host ports. API roles receive no migration-owner URL.
- TLS Web/readiness/task routes returned 200. API readiness reported database, both Redis instances and storage up.
- Signed S3 HTTPS download returned the exact test payload through the public storage host; signed Host/port/path were preserved. Temporary object removed.
- Nginx syntax/reload passed. Access query-string redaction passed with a sentinel. Docker-DNS upstream zones and critical-only error logging are configured.
- API SIGTERM completed without forced kill/OOM (exit 143, standard SIGTERM convention); Web exited 0. Main stack restored to healthy final images.
- Final repository checks `npm run -ws typecheck` and `npm run -ws lint` passed across all five workspaces.
- git diff --check passed. Migrations 0000–0020 and existing test assertions are untouched. Full existing unit/integration/live suites were not rerun for this infrastructure change.

## Host-specific mount verification

Docker Desktop Ubuntu integration is disabled on this Windows host, so ordinary binds from the required WSL checkout are inaccessible. Verification transferred the same files into separate Docker volumes with an ignored local mount override. Users, images, commands, topology, credentials, limits and TLS behavior stayed the delivered configuration. Default file binds are intended for a normal Linux Docker host or an integrated Docker Desktop distro.

Boot instructions and environment handling: [containerization.md](containerization.md). Exact machine-readable layers: [image-layers.json](image-layers.json). Raw build/cache/smoke evidence is in ignored `.local/prod/`. This report contains no runtime secrets.
