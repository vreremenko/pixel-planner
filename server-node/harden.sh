#!/usr/bin/env bash
# Защита сервера (повторный запуск безопасен): вход по SSH только по ключу, fail2ban, закрытые права на данные.
#   HOST=92.63.103.91 bash server-node/harden.sh
# Скрипт сам проверяет, что вход по ключу работает, прежде чем отключать вход по паролю.
set -euo pipefail

HOST="${HOST:?нужен HOST}"
KEY="${KEY:-$HOME/.ssh/pp_selectel}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ConnectionAttempts=4 "root@$HOST")

echo "== проверка входа по ключу"
"${SSH[@]}" 'test -s /root/.ssh/authorized_keys && echo "ключ на сервере есть"'

echo "== fail2ban и автообновления безопасности"
"${SSH[@]}" 'export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq fail2ban unattended-upgrades >/dev/null
cat > /etc/fail2ban/jail.d/pixel-planner.local <<JAIL
[sshd]
enabled = true
maxretry = 4
findtime = 10m
bantime = 1h
JAIL
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban
systemctl is-active fail2ban'

echo "== SSH только по ключу, без пароля"
"${SSH[@]}" 'cat > /etc/ssh/sshd_config.d/00-pixel-planner.conf <<SSHD
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
X11Forwarding no
SSHD
sshd -t && systemctl reload ssh'
# Новое соединение по ключу должно по-прежнему работать
"${SSH[@]}" 'sshd -T | grep -iE "^(passwordauthentication|permitrootlogin|maxauthtries) "'

echo "== права на данные и очистка"
"${SSH[@]}" 'chmod 700 /var/lib/pixel-planner && chmod -R go-rwx /var/lib/pixel-planner
apt-get autoremove -y -qq >/dev/null; apt-get clean
journalctl --vacuum-time=14d >/dev/null 2>&1 || true
ls -ld /var/lib/pixel-planner | awk "{print \$1, \$3, \$4, \$9}"'
echo "== готово"
