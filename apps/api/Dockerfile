# syntax=docker/dockerfile:1.7
# Build from the monorepo root. The default target is the API daemon; use --target migrator
# for the one-shot database job, never pass database-owner credentials to the daemon.
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
WORKDIR /repo

# Only manifests participate in the dependency cache. Other services' source does not.
FROM base AS installer
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/jalali/package.json packages/jalali/
COPY packages/text/package.json packages/text/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=taskin-api-npm,target=/root/.npm,sharing=locked \
    npm ci --workspace @taskin/api --include-workspace-root --no-audit --no-fund

FROM installer AS builder
COPY tsconfig.base.json ./
COPY packages/contracts/tsconfig.json packages/contracts/
COPY packages/contracts/src packages/contracts/src
COPY packages/jalali/tsconfig.json packages/jalali/
COPY packages/jalali/src packages/jalali/src
COPY packages/text/tsconfig.json packages/text/
COPY packages/text/src packages/text/src
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
COPY infra/docker/api-runtime.mjs /tmp/api-runtime.mjs
RUN npm run build --workspace @taskin/api \
    && node /tmp/api-runtime.mjs assets /repo /runtime

# A second clean installation prevents accidental promotion of builder/dev dependencies.
FROM base AS production-dependencies
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/jalali/package.json packages/jalali/
COPY packages/text/package.json packages/text/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=taskin-api-npm,target=/root/.npm,sharing=locked \
    npm ci --workspace @taskin/api --include-workspace-root=false --omit=dev --no-audit --no-fund \
    && mkdir -p apps/api/node_modules
COPY infra/docker/api-runtime.mjs /tmp/api-runtime.mjs
RUN node /tmp/api-runtime.mjs dependencies /repo \
    && node /tmp/api-runtime.mjs migrations /repo /migration-runtime

# Strip debug symbols with a pinned build-only tool and preserve library symlinks; wildcard COPY of individual
# links would duplicate the same library bytes. This build-only stage is not shipped.
FROM base AS runtime-binaries
RUN apk add --no-cache binutils=2.45.1-r1
RUN mkdir -p /runtime-root/usr/local/bin /runtime-root/lib /runtime-root/usr/lib /runtime-root/etc/ssl/certs /runtime-root/home /runtime-root/usr/local/share/licenses/node \
    && cp -a /usr/local/bin/node /runtime-root/usr/local/bin/ \
    && strip --strip-unneeded /runtime-root/usr/local/bin/node \
    && cp -a /usr/local/LICENSE /runtime-root/usr/local/share/licenses/node/LICENSE \
    && cp -a /lib/*musl*.so.1 /runtime-root/lib/ \
    && cp -a /usr/lib/libstdc++.so.6* /usr/lib/libgcc_s.so.1 /runtime-root/usr/lib/ \
    && cp -a /etc/passwd /etc/group /etc/alpine-release /runtime-root/etc/ \
    && cp -a /etc/ssl/certs/ca-certificates.crt /runtime-root/etc/ssl/certs/ \
    && cp -a /home/node /runtime-root/home/ \
    && cp -a /tmp /runtime-root/

# The daemon and migrator contain Node and its runtime libraries only: no shell,
# npm/apk/yarn/corepack, compilers or package-manager bytes in any final layer.
FROM scratch AS runtime-base
COPY --from=runtime-binaries /runtime-root /
ENV NODE_ENV=production \
    LIBC=musl \
    PATH=/usr/local/bin \
    HOME=/home/node \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
WORKDIR /repo/apps/api
USER node

# The migration job has no HTTP daemon/health check. Its compiled imports resolve at
# dist/platform/db/migrate.js, whose relative URL finds db/migrations unchanged.
FROM runtime-base AS migrator
COPY --from=production-dependencies --chown=node:node /migration-runtime/node_modules /repo/node_modules
COPY --from=production-dependencies --chown=node:node /migration-runtime/apps/api/node_modules ./node_modules
COPY --from=builder --chown=node:node /runtime/apps/api/package.json ./package.json
COPY --from=builder --chown=node:node /repo/apps/api/dist/cli/migrate.js ./dist/cli/migrate.js
COPY --from=builder --chown=node:node /repo/apps/api/dist/platform/db/migrate.js ./dist/platform/db/migrate.js
COPY --chown=node:node apps/api/db/migrations/*.sql ./db/migrations/
COPY --chown=node:node apps/api/db/migrations/meta/_journal.json ./db/migrations/meta/_journal.json
CMD ["/usr/local/bin/node", "dist/cli/migrate.js"]

FROM runtime-base AS runner
COPY --from=production-dependencies --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=production-dependencies --chown=node:node /repo/apps/api/node_modules ./node_modules
COPY --from=builder --chown=node:node /runtime/packages /repo/packages
COPY --from=builder --chown=node:node /runtime/apps/api ./
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=4s --start-period=30s --retries=3 \
    CMD ["/usr/local/bin/node", "--input-type=module", "-e", "try { const response = await fetch('http://127.0.0.1:' + (process.env.PORT || '4000') + '/health/ready', { signal: AbortSignal.timeout(3000) }); process.exit(response.ok ? 0 : 1); } catch { process.exit(1); }"]
CMD ["/usr/local/bin/node", "--import", "./dist/instrument.js", "dist/main.js"]
