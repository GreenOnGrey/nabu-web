# Nabu web: React SPA на nginx (без root, порт 8080).
#   API_BASE_URL  — адрес API в /config.json (пусто — тот же origin);
#   API_UPSTREAM  — если задан, nginx проксирует /api, /admin/api, /hooks на этот
#                   адрес (docker compose); без него отдаётся только статика, а
#                   API — на своём домене (Kubernetes, FTR.NAB.CMN-0001).
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS release
ARG VERSION=dev
USER root
RUN apk upgrade --no-cache
COPY deploy/proxy.conf.template deploy/static.conf.template /etc/nginx/nabu/
COPY --chmod=0755 deploy/05-nabu-config.sh /docker-entrypoint.d/05-nabu-config.sh
COPY --from=build /src/dist /usr/share/nginx/html
# Точка входа пишет config.json и выбирает шаблон nginx под пользователем nginx (101).
RUN mkdir -p /etc/nginx/templates && chown -R 101:101 /usr/share/nginx/html /etc/nginx/templates
LABEL org.opencontainers.image.title="nabu-web" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/GreenOnGrey/nabu-web"
USER 101:101
EXPOSE 8080
