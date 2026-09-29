FROM node:22-bookworm-slim AS build
WORKDIR /lab
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/telemetry/package.json packages/telemetry/
COPY apps/antifraud/package.json apps/antifraud/
COPY apps/command-api/package.json apps/command-api/
COPY apps/query-api/package.json apps/query-api/
COPY apps/projector/package.json apps/projector/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /lab
ENV NODE_ENV=production
COPY --from=build /lab /lab
