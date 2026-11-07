#!/usr/bin/env bash
# Публикует посредника Telegram на Cloudflare и подключает к нему бота. Ключи не выводятся.
#   bash relay/deploy.sh
# Настройки берёт из server-node/.env.vps; адрес посредника и его ключ дописывает туда же.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=server-node/.env.vps
SERVER_URL="${SERVER_URL:-https://92-63-103-91.sslip.io}"
NAME=pp-tg-relay

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${TELEGRAM_BOT_TOKEN:?в $ENV_FILE нет TELEGRAM_BOT_TOKEN}"
if [ -z "${TELEGRAM_RELAY_KEY:-}" ]; then
  TELEGRAM_RELAY_KEY="$(openssl rand -hex 32)"
  printf '\nTELEGRAM_RELAY_KEY=%s\n' "$TELEGRAM_RELAY_KEY" >> "$ENV_FILE"
fi

echo "== публикация на Cloudflare"
OUT="$(npx --yes wrangler@4 deploy relay/telegram-relay.js --name "$NAME" --compatibility-date 2026-10-01 2>&1)"
URL="$(printf '%s\n' "$OUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)"
[ -n "$URL" ] || { printf '%s\n' "$OUT" | tail -8; echo "Адрес посредника не найден"; exit 1; }
echo "$URL"
if [ "${TELEGRAM_RELAY_URL:-}" != "$URL" ]; then
  grep -v '^TELEGRAM_RELAY_URL=' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE" && chmod 600 "$ENV_FILE"
  printf 'TELEGRAM_RELAY_URL=%s\n' "$URL" >> "$ENV_FILE"
fi

echo "== секреты посредника"
printf '%s' "$TELEGRAM_RELAY_KEY" | npx --yes wrangler@4 secret put RELAY_KEY --name "$NAME" >/dev/null
printf '%s' "$SERVER_URL" | npx --yes wrangler@4 secret put SERVER_URL --name "$NAME" >/dev/null

echo "== подключение бота"
sleep 5
curl -fsS -m 20 "$URL/ping"; echo
curl -sS -m 20 -X POST "$URL/out/$TELEGRAM_RELAY_KEY/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"$URL/in/$TELEGRAM_RELAY_KEY\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}"
echo
echo "== готово"
