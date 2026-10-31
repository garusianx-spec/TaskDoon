# syntax=docker/dockerfile:1.7

# Pin the build toolchain and the runtime binary to the same immutable release.
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# The final image inherits no package manager or shell from this build image.
RUN mkdir -p /runtime-root/app /runtime-root/tmp \
    && chown node:node /runtime-root/app \
    && chmod 1777 /runtime-root/tmp

# Strip only non-runtime ELF symbols in a build stage. The exact package pin
# keeps this preparation reproducible; no binutils/APK files enter the runner.
FROM base AS runtime-binaries
RUN apk add --no-cache binutils=2.45.1-r1 \
    && mkdir -p /runtime-root/usr/local/bin /runtime-root/usr/local/share/licenses/node \
        /runtime-root/usr/lib /runtime-root/lib /runtime-root/etc/ssl/certs \
    && cp /usr/local/bin/node /runtime-root/usr/local/bin/node \
    && strip --strip-unneeded /runtime-root/usr/local/bin/node \
    && cp -a /lib/*musl*.so.1 /runtime-root/lib/ \
    && cp -a /usr/lib/libstdc++.so.6* /usr/lib/libgcc_s.so.1 /runtime-root/usr/lib/ \
    && cp /etc/passwd /etc/group /etc/alpine-release /runtime-root/etc/ \
    && cp /etc/ssl/certs/ca-certificates.crt /runtime-root/etc/ssl/certs/ \
    && cp /usr/local/LICENSE /runtime-root/usr/local/share/licenses/node/LICENSE

# Source changes do not invalidate the deterministic dependency installation.
FROM base AS installer
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/jalali/package.json packages/jalali/package.json
COPY packages/text/package.json packages/text/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=@taskin/web --include-workspace-root --no-audit --no-fund

FROM installer AS builder
COPY tsconfig.base.json ./
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY packages/jalali/tsconfig.json packages/jalali/tsconfig.json
COPY packages/jalali/src packages/jalali/src
COPY packages/text/tsconfig.json packages/text/tsconfig.json
COPY packages/text/src packages/text/src
COPY apps/web/next.config.mjs apps/web/tsconfig.json apps/web/eslint.config.mjs apps/web/postcss.config.mjs apps/web/tailwind.config.ts apps/web/
COPY apps/web/scripts/container-build-id.mjs apps/web/scripts/container-build-id.mjs
COPY apps/web/src apps/web/src
COPY apps/web/public apps/web/public

# Browser-visible values are compiled into the JS bundles, never runtime secrets.
ARG NEXT_PUBLIC_DATA_SOURCE=api
ARG NEXT_PUBLIC_RT_URL=
# Next rewrites are serialized during build; this is a nonsecret network address.
ARG TASKIN_API_ORIGIN=http://api:4000
ENV NEXT_PUBLIC_DATA_SOURCE=${NEXT_PUBLIC_DATA_SOURCE} \
    NEXT_PUBLIC_RT_URL=${NEXT_PUBLIC_RT_URL} \
    TASKIN_API_ORIGIN=${TASKIN_API_ORIGIN} \
    NODE_ENV=production
RUN npm run build --workspace=@taskin/web

# Next also traces optional build-time imports. They are not needed by its
# production server; remove the TypeScript and native SWC compilers explicitly.
FROM builder AS runtime-artifacts
RUN rm -rf apps/web/.next/standalone/apps/web/scripts/container-build-id.mjs \
        apps/web/.next/standalone/node_modules/typescript \
        apps/web/.next/standalone/node_modules/@types \
        apps/web/.next/standalone/node_modules/@next/swc-* \
        apps/web/.next/standalone/node_modules/@img/sharp-linux-* \
        apps/web/.next/standalone/node_modules/@img/sharp-libvips-linux-* \
        apps/web/.next/standalone/node_modules/@img/sharp-wasm32 \
        apps/web/.next/standalone/node_modules/next/dist/build/babel \
        apps/web/.next/standalone/node_modules/next/dist/build/swc \
        apps/web/.next/standalone/node_modules/next/dist/build/webpack \
        apps/web/.next/standalone/node_modules/next/dist/compiled/babel-packages \
        apps/web/.next/standalone/node_modules/next/dist/compiled/next-devtools \
        apps/web/.next/standalone/node_modules/next/dist/server/typescript \
    && find apps/web/.next/standalone/node_modules/next/dist/compiled/babel -type f \
        ! -name code-frame.js ! -name package.json -delete \
    && find apps/web/.next/standalone -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.map' \) -delete \
    && test ! -d apps/web/.next/standalone/node_modules/typescript

# Copy only Node's runtime libraries and the traced Next server. No npm, apk,
# compiler, source tree, or build dependencies enter any final image layer.
FROM scratch AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=runtime-binaries /runtime-root/ /
WORKDIR /app
COPY --from=runtime-artifacts --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/ready',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["/usr/local/bin/node", "apps/web/server.js"]
