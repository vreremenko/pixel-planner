#!/usr/bin/env bash
# Разовая настройка автовыкладки сервера через GitHub Actions (повторный запуск безопасен).
#   HOST=92.63.103.91 bash server-node/setup-autodeploy.sh
#
# Что делает:
#   1. создаёт на этом компьютере отдельный ключ только для выкладки (~/.ssh/pp_deploy_ci);
#   2. заводит на сервере пользователя ppdeploy, которому этот ключ разрешает ровно одно действие:
#      принять новую сборку сервера, заменить ею старую и перезапустить службу. Оболочки, файлов
#      и настроек (/etc/pixel-planner.env с ключами) этот пользователь не видит;
#   3. кладёт закрытую половину ключа в секреты репозитория на GitHub (через gh), адрес сервера — в переменные.
#
# Настройки, службы systemd и Caddy по-прежнему ставит deploy.sh: он нужен только когда меняются они.
# Отключить автовыкладку: gh variable delete DEPLOY_HOST
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${HOST:?нужен HOST}"
KEY="${KEY:-$HOME/.ssh/pp_selectel}"
CI_KEY="${CI_KEY:-$HOME/.ssh/pp_deploy_ci}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ConnectionAttempts=4 "root@$HOST")

command -v gh >/dev/null || { echo "нужен GitHub CLI (gh)"; exit 1; }

echo "== ключ для выкладки"
if [ ! -f "$CI_KEY" ]; then
  ssh-keygen -q -t ed25519 -N '' -C 'pixel-planner-github-deploy' -f "$CI_KEY"
  echo "создан $CI_KEY"
else
  echo "уже есть $CI_KEY"
fi
PUB="$(cat "$CI_KEY.pub")"

echo "== сервер: пользователь ppdeploy и скрипт приёма сборки"
"${SSH[@]}" 'cat > /usr/local/sbin/pp-deploy-apply && chmod 755 /usr/local/sbin/pp-deploy-apply' <<'APPLY'
#!/usr/bin/env bash
# Принимает со стандартного входа tar с server.mjs и backup.mjs, ставит их и перезапускает службу.
# Запускается только через ключ выкладки (см. authorized_keys пользователя ppdeploy). Если новая сборка
# не поднялась, возвращает прежнюю.
set -euo pipefail
umask 022
DIR=/opt/pixel-planner
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
head -c 20000000 > "$T/in.tar"
# Только два известных файла: никаких путей и лишних имён из архива
tar -xf "$T/in.tar" -C "$T" --no-same-owner --no-same-permissions server.mjs backup.mjs
for f in server.mjs backup.mjs; do
  # Обычный файл, не ссылка (жёсткая ссылка из архива могла бы подсунуть чужой файл)
  [ -f "$T/$f" ] && [ ! -L "$T/$f" ] && [ -s "$T/$f" ] && [ "$(stat -c %h "$T/$f")" = 1 ] || { echo "в архиве нет $f"; exit 1; }
  /opt/node/bin/node --check "$T/$f" || { echo "$f не проходит проверку синтаксиса"; exit 1; }
done
if cmp -s "$T/server.mjs" "$DIR/server.mjs" && cmp -s "$T/backup.mjs" "$DIR/backup.mjs"; then
  echo "сервер без изменений, перезапуск не нужен"
  exit 0
fi
cp -p "$DIR/server.mjs" "$DIR/server.mjs.prev"
cp -p "$DIR/backup.mjs" "$DIR/backup.mjs.prev"
install -m 644 -o root -g root "$T/server.mjs" "$DIR/server.mjs"
install -m 644 -o root -g root "$T/backup.mjs" "$DIR/backup.mjs"
healthy() {
  for _ in 1 2 3 4 5 6; do
    sleep 2
    systemctl is-active -q pixel-planner && curl -fsS -m 5 -o /dev/null http://127.0.0.1:8787/api/config && return 0
  done
  return 1
}
systemctl restart pixel-planner
if healthy; then
  echo "сервер обновлён и отвечает"
else
  echo "новая сборка не поднялась — возвращаю прежнюю"
  journalctl -u pixel-planner --no-pager -n 15 | cut -c1-300 || true
  cp -p "$DIR/server.mjs.prev" "$DIR/server.mjs"
  cp -p "$DIR/backup.mjs.prev" "$DIR/backup.mjs"
  systemctl restart pixel-planner
  healthy && echo "прежняя сборка работает" || echo "ВНИМАНИЕ: и прежняя сборка не отвечает"
  exit 1
fi
APPLY

"${SSH[@]}" "set -e
command -v sudo >/dev/null || { export DEBIAN_FRONTEND=noninteractive; apt-get install -y -qq sudo >/dev/null; }
id ppdeploy >/dev/null 2>&1 || useradd --system --create-home --home /var/lib/ppdeploy --shell /bin/sh ppdeploy
# Учётная запись без пароля: вход только по ключу
usermod -p '*' ppdeploy
install -d -m 700 -o ppdeploy -g ppdeploy /var/lib/ppdeploy/.ssh
# Ключ разрешает только одну команду; терминал, пересылка портов и всё остальное запрещены
printf '%s\n' 'restrict,command=\"sudo -n /usr/local/sbin/pp-deploy-apply\" $PUB' > /var/lib/ppdeploy/.ssh/authorized_keys
chown ppdeploy:ppdeploy /var/lib/ppdeploy/.ssh/authorized_keys && chmod 600 /var/lib/ppdeploy/.ssh/authorized_keys
printf '%s\n' 'ppdeploy ALL=(root) NOPASSWD: /usr/local/sbin/pp-deploy-apply' > /etc/sudoers.d/pp-deploy
chmod 440 /etc/sudoers.d/pp-deploy && visudo -cf /etc/sudoers.d/pp-deploy >/dev/null
echo 'готово'"

echo "== проверка: ключ выкладки не даёт оболочку"
OUT="$(ssh -i "$CI_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10 "ppdeploy@$HOST" 'id; cat /etc/pixel-planner.env' </dev/null 2>&1 || true)"
if echo "$OUT" | grep -qE 'uid=|VAPID|TELEGRAM'; then
  echo "ОШИБКА: ключ выкладки выполнил постороннюю команду"; exit 1
fi
echo "ок: вместо команды сервер ждёт только сборку"

echo "== GitHub: секрет и переменные"
gh secret set DEPLOY_SSH_KEY < "$CI_KEY"
# Отпечаток сервера берём по уже проверенному соединению, а не из сети заново
"${SSH[@]}" 'for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do [ -f "$f" ] && cut -d" " -f1,2 "$f"; done' | sed "s/^/$HOST /" | gh variable set DEPLOY_KNOWN_HOSTS
gh variable set DEPLOY_HOST --body "$HOST"
echo "== готово: при следующей отправке в main сервер обновится сам (вкладка Actions на GitHub)"
