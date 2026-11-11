/*
 * Расшифровать копию базы, которую прислал бот:
 *   node scripts/decrypt-backup.ts ~/Downloads/pixel-planner-2026-11-11.ppbak
 * Ключ берётся из server-node/.env.vps (BACKUP_KEY). Рядом появится файл .sqlite.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decryptBackup, parseKey } from '../server-node/src/backup-crypto.ts';

const file = process.argv[2];
if (!file) {
  console.error('Укажите файл копии: node scripts/decrypt-backup.ts <файл.ppbak>');
  process.exit(1);
}
const env = readFileSync(new URL('../server-node/.env.vps', import.meta.url), 'utf8');
const key = parseKey(/^BACKUP_KEY=(.+)$/m.exec(env)?.[1]?.trim());
if (!key) {
  console.error('В server-node/.env.vps нет ключа BACKUP_KEY');
  process.exit(1);
}
const out = file.replace(/\.ppbak$/, '') + '.sqlite';
writeFileSync(out, decryptBackup(readFileSync(file), key), { mode: 0o600 });
console.log(`Готово: ${out}`);
