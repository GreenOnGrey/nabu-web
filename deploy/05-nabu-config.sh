#!/bin/sh
# Выполняется образом nginx до подстановки шаблонов (/docker-entrypoint.d).
#   - пишет /config.json из API_BASE_URL: один образ web подходит для любых доменов;
#   - выбирает конфигурацию: с API_UPSTREAM — nginx проксирует /api (docker compose),
#     без него — только статика (API на отдельном домене, FTR.NAB.CMN-0001).
set -eu

html=/usr/share/nginx/html
api=${API_BASE_URL:-}
case $api in
  "" | http://* | https://*) ;;
  *) echo "05-nabu-config: API_BASE_URL должен начинаться с http:// или https://" >&2; exit 1 ;;
esac
# Экранирование для JSON: адрес не содержит кавычек и обратных слешей.
case $api in *'"'* | *'\'*) echo "05-nabu-config: недопустимый API_BASE_URL" >&2; exit 1 ;; esac
printf '{ "apiBaseUrl": "%s" }\n' "${api%/}" >"$html/config.json"

if [ -n "${API_UPSTREAM:-}" ]; then
  cp /etc/nginx/nabu/proxy.conf.template /etc/nginx/templates/default.conf.template
  echo "05-nabu-config: прокси /api → $API_UPSTREAM"
else
  cp /etc/nginx/nabu/static.conf.template /etc/nginx/templates/default.conf.template
  echo "05-nabu-config: только статика, API: ${api:-тот же origin}"
fi
