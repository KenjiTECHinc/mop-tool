# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY infra/package.json infra/package.json

RUN npm ci -w web -w @mops/shared

COPY packages/shared packages/shared
COPY apps/web apps/web
COPY scripts/check-i18n.mjs scripts/check-i18n.mjs

RUN npm run build -w @mops/shared

# Baked at build time. Not a secret. The browser calls this same origin and
# nginx proxies it to the api service. Local `npm run dev` still reads
# VITE_API_URL from the repo .env (http://localhost:3001).
ENV VITE_API_URL=/api
RUN npm run build -w web

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

RUN mkdir -p /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp \
  && chown -R nginx:nginx /usr/share/nginx/html /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp

USER nginx

EXPOSE 5173

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
