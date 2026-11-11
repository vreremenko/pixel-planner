/*
 * Ежедневная копия базы (запускает systemd-таймер; руками: node /opt/pixel-planner/backup.mjs).
 * 1. Консистентный снимок (VACUUM INTO) в /var/backups/pixel-planner, хранятся последние 14.
 * 2. Раз в сутки зашифрованная копия уходит админу в Telegram: если сервер умрёт вместе с диском, данные не пропадут.
 *    Расшифровать: node scripts/decrypt-backup.ts <файл>.
 */
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { encryptBackup, parseKey } from './backup-crypto.ts';

const SRC = process.env.DB_PATH ?? '/var/lib/pixel-planner/pixel-planner.sqlite';
const DIR = process.env.BACKUP_DIR ?? '/var/backups/pixel-planner';
const KEEP = 14;
/** Отправлять копию в Telegram только раз в день: таймер и каждый деплой запускают копию заново. */
const SENT_MARK = `${DIR}/telegram-sent`;
const TELEGRAM_MAX_BYTES = 49 * 1024 * 1024;

const today = new Date().toISOString().slice(0, 10);

function snapshot(): string {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const file = `${DIR}/pixel-planner-${today}.sqlite`;
  try {
    unlinkSync(file);
  } catch {
    // копии за сегодня ещё нет
  }
  const db = new DatabaseSync(SRC, { readOnly: true });
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  db.close();
  const old = readdirSync(DIR).filter((f) => /^pixel-planner-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().slice(0, -KEEP);
  for (const f of old) unlinkSync(`${DIR}/${f}`);
  return file;
}

/** Telegram админа с подтверждённой почтой: туда и уходит копия. */
function adminChat(): number | null {
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (admins.length === 0) return null;
  const db = new DatabaseSync(SRC, { readOnly: true });
  try {
    const rows = db.prepare('SELECT email, telegram_id AS tg FROM users WHERE telegram_id IS NOT NULL AND email_verified_at IS NOT NULL').all() as { email: string; tg: string }[];
    const row = rows.find((r) => admins.includes(r.email));
    return row ? Number(row.tg) : null;
  } finally {
    db.close();
  }
}

async function sendToTelegram(file: string): Promise<string> {
  const key = parseKey(process.env.BACKUP_KEY);
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_RELAY_URL: relay, TELEGRAM_RELAY_KEY: relayKey } = process.env;
  if (!key) return 'в Telegram не отправлена: нет ключа шифрования BACKUP_KEY';
  if (!token || !relay || !relayKey) return 'в Telegram не отправлена: бот не настроен';
  let sentDay = '';
  try {
    sentDay = readFileSync(SENT_MARK, 'utf8').trim();
  } catch {
    // ещё не отправляли
  }
  if (sentDay === today) return 'в Telegram сегодня уже отправлена';
  const chat = adminChat();
  if (chat === null) return 'в Telegram не отправлена: у админа нет привязанного Telegram или почта не подтверждена';
  const enc = encryptBackup(readFileSync(file), key);
  if (enc.length > TELEGRAM_MAX_BYTES) return `в Telegram не отправлена: копия больше 49 МБ (${String(enc.length)} байт)`;
  const form = new FormData();
  form.set('chat_id', String(chat));
  form.set('caption', `Копия базы PIXEL PLANNER за ${today}, ${(enc.length / 1024).toFixed(0)} КБ. Зашифрована, хранить как есть.`);
  form.set('disable_notification', 'true');
  form.set('document', new Blob([new Uint8Array(enc)]), `pixel-planner-${today}.ppbak`);
  const res = await fetch(`${relay}/out/${relayKey}/bot${token}/sendDocument`, {
    method: 'POST',
    headers: { 'user-agent': 'PixelPlanner/1.0' },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Telegram ответил ${String(res.status)}`);
  writeFileSync(SENT_MARK, today);
  return 'отправлена в Telegram';
}

const file = snapshot();
console.log(`копия: ${file}; хранится копий: ${String(readdirSync(DIR).filter((f) => f.endsWith('.sqlite')).length)}`);
try {
  console.log(await sendToTelegram(file));
} catch (e) {
  // Локальная копия уже есть, поэтому не падаем: ошибку видно в журнале
  console.error('копия в Telegram не ушла:', e instanceof Error ? e.message : e);
}
