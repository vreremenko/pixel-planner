#!/usr/bin/env bash
# Установка/обновление сервера PIXEL PLANNER на VPS с Ubuntu (Node.js 22 уже стоит в /opt/node).
#   HOST=92.63.103.91 bash server-node/deploy.sh
# Переменные: HOST (обязательно), DOMAIN (адрес для HTTPS через Caddy; по умолчанию <ip>.sslip.io),
# KEY (ключ SSH, по умолчанию ~/.ssh/pp_selectel), ENV_FILE (файл с ключами VAPID, по умолчанию server-node/.env.vps).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${HOST:?нужен HOST}"
# Без своего домена берём адрес вида 92-63-103-91.sslip.io: он указывает на IP, и для него выдаётся настоящий сертификат
DOMAIN="${DOMAIN:-${HOST//./-}.sslip.io}"
KEY="${KEY:-$HOME/.ssh/pp_selectel}"
ENV_FILE="${ENV_FILE:-server-node/.env.vps}"
ORIGINS="${ALLOWED_ORIGINS:-https://vreremenko.github.io}"
SSH=(ssh -i "$KEY" -o BatchMode=yes "root@$HOST")

echo "== сборка"
npm run build:node >/dev/null

echo "== пользователь, папки, сервер"
"${SSH[@]}" 'id pp >/dev/null 2>&1 || useradd --system --home /var/lib/pixel-planner --shell /usr/sbin/nologin pp
mkdir -p /opt/pixel-planner /var/lib/pixel-planner && chown pp:pp /var/lib/pixel-planner'
scp -q -i "$KEY" server-node/dist/server.mjs "root@$HOST:/opt/pixel-planner/server.mjs"

echo "== настройки (ключи не выводятся)"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
{
  echo "PORT=8787"
  echo "DB_PATH=/var/lib/pixel-planner/pixel-planner.sqlite"
  echo "ALLOWED_ORIGINS=$ORIGINS"
  echo "VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY"
  echo "VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY"
  echo "VAPID_SUBJECT=$VAPID_SUBJECT"
} | "${SSH[@]}" 'umask 077; cat > /etc/pixel-planner.env; chown root:pp /etc/pixel-planner.env; chmod 640 /etc/pixel-planner.env'

echo "== служба systemd"
"${SSH[@]}" 'cat > /etc/systemd/system/pixel-planner.service' <<'UNIT'
[Unit]
Description=PIXEL PLANNER API
After=network.target

[Service]
User=pp
EnvironmentFile=/etc/pixel-planner.env
ExecStart=/opt/node/bin/node --disable-warning=ExperimentalWarning /opt/pixel-planner/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/pixel-planner
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
"${SSH[@]}" 'systemctl daemon-reload && systemctl enable pixel-planner >/dev/null 2>&1 && systemctl restart pixel-planner && sleep 2 && systemctl is-active pixel-planner'

echo "== Caddy (HTTPS)"
"${SSH[@]}" 'command -v caddy >/dev/null || {
  curl -fsS -o /usr/local/bin/caddy "https://caddyserver.com/api/download?os=linux&arch=amd64" && chmod +x /usr/local/bin/caddy
  id caddy >/dev/null 2>&1 || useradd --system --home /var/lib/caddy --create-home --shell /usr/sbin/nologin caddy
  mkdir -p /etc/caddy
  setcap cap_net_bind_service=+ep /usr/local/bin/caddy
}
/usr/local/bin/caddy version'
SITE="$DOMAIN"
"${SSH[@]}" "cat > /etc/caddy/Caddyfile" <<CADDY
$SITE {
	reverse_proxy 127.0.0.1:8787
}
CADDY
"${SSH[@]}" 'cat > /etc/systemd/system/caddy.service' <<'UNIT'
[Unit]
Description=Caddy
After=network.target

[Service]
User=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile
Restart=always
AmbientCapabilities=CAP_NET_BIND_SERVICE
Environment=XDG_DATA_HOME=/var/lib/caddy

[Install]
WantedBy=multi-user.target
UNIT
"${SSH[@]}" 'systemctl daemon-reload && systemctl enable caddy >/dev/null 2>&1 && systemctl restart caddy && sleep 3 && systemctl is-active caddy'
echo "== готово: https://$DOMAIN/api/config"
