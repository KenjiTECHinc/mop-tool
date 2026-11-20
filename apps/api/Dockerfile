# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY infra/package.json infra/package.json

RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY scripts scripts

RUN npm run build -w @mops/shared

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /app /app
COPY --chmod=755 --chown=node:node apps/api/docker-entrypoint.sh /entrypoint.sh

USER node

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/data/mops.sqlite \
    AUDIT_LOG_PATH=/data/audit.log

EXPOSE 3001

VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
