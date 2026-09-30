# syntax=docker/dockerfile:1
# The API image (one image, every runtime role: APP_ROLE=http|ws|worker|all). Build from the repo
# root: docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/jalali/package.json packages/jalali/
COPY packages/text/package.json packages/text/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @taskin/api --include-workspace-root --ignore-scripts=false
COPY packages packages
COPY apps/api apps/api
RUN npx tsc -b apps/api

FROM node:22-alpine AS runtime-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/jalali/package.json packages/jalali/
COPY packages/text/package.json packages/text/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# npm nests a few dependencies under the workspace itself; keep the directory even when it is empty.
RUN npm ci --workspace @taskin/api --omit=dev && mkdir -p apps/api/node_modules

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=runtime-deps /repo/node_modules node_modules
COPY --from=runtime-deps /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/packages/contracts/package.json packages/contracts/package.json
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/packages/jalali/package.json packages/jalali/package.json
COPY --from=build /repo/packages/jalali/dist packages/jalali/dist
COPY --from=build /repo/packages/text/package.json packages/text/package.json
COPY --from=build /repo/packages/text/dist packages/text/dist
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/db apps/api/db
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "--import", "./dist/instrument.js", "dist/main.js"]
