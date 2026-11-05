#!/bin/sh
# The nginx image runs this before it fills in templates (/docker-entrypoint.d).
#   - writes /config.json from API_BASE_URL: one web image fits any domains;
#   - picks the configuration: with API_UPSTREAM nginx proxies /api (docker compose),
#     without it only static files (the API on a domain of its own, FTR.NAB.CMN-0001).
set -eu

html=/usr/share/nginx/html
api=${API_BASE_URL:-}
case $api in
  "" | http://* | https://*) ;;
  *) echo "05-nabu-config: API_BASE_URL must start with http:// or https://" >&2; exit 1 ;;
esac
# Escaping for JSON: the address holds no quotes and no backslashes.
case $api in *'"'* | *'\'*) echo "05-nabu-config: invalid API_BASE_URL" >&2; exit 1 ;; esac
printf '{ "apiBaseUrl": "%s" }\n' "${api%/}" >"$html/config.json"

if [ -n "${API_UPSTREAM:-}" ]; then
  cp /etc/nginx/nabu/proxy.conf.template /etc/nginx/templates/default.conf.template
  echo "05-nabu-config: proxy /api → $API_UPSTREAM"
else
  cp /etc/nginx/nabu/static.conf.template /etc/nginx/templates/default.conf.template
  echo "05-nabu-config: only static files, API: ${api:-the same origin}"
fi
