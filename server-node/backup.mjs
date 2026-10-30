// Ежедневная копия базы: консистентный снимок (VACUUM INTO) в /var/backups/pixel-planner, хранятся последние 14.
// Запускается systemd-таймером; руками: node /opt/pixel-planner/backup.mjs
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const SRC = process.env.DB_PATH ?? '/var/lib/pixel-planner/pixel-planner.sqlite';
const DIR = process.env.BACKUP_DIR ?? '/var/backups/pixel-planner';
const KEEP = 14;

mkdirSync(DIR, { recursive: true, mode: 0o700 });
const file = `${DIR}/pixel-planner-${new Date().toISOString().slice(0, 10)}.sqlite`;
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
console.log(`копия: ${file}; хранится копий: ${String(readdirSync(DIR).length)}`);
