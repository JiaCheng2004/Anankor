# syntax=docker/dockerfile:1.7
FROM node:22.21.0-slim AS base

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/master/package.json apps/master/

# Pre-copy package manifests for workspaces to leverage pnpm fetch later on
COPY packages/core/package.json packages/core/
COPY packages/config/package.json packages/config/
COPY packages/logger/package.json packages/logger/
COPY packages/telemetry/package.json packages/telemetry/
COPY packages/discord/package.json packages/discord/
COPY packages/ipc/package.json packages/ipc/
COPY packages/storage/package.json packages/storage/
COPY packages/music/package.json packages/music/
COPY packages/schemas/package.json packages/schemas/

RUN pnpm install --frozen-lockfile=false

COPY . .

RUN pnpm --filter @anankor/master... build

CMD ["node", "apps/master/dist/index.js"]
