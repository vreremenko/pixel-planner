import { db, SYNC_TABLES, type SyncTable } from './db';

export const BACKUP_APP = 'pixel-planner';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  tables: Partial<Record<SyncTable, unknown[]>>;
}

export async function exportAll(): Promise<Backup> {
  const tables: Backup['tables'] = {};
  for (const name of SYNC_TABLES) tables[name] = await db.table(name).toArray();
  return { app: BACKUP_APP, schemaVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

type Row = { id: string; updatedAt: number } & Record<string, unknown>;

const isRow = (x: unknown): x is Row =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as Row).id === 'string' &&
  typeof (x as Row).updatedAt === 'number';

export function parseBackup(json: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Файл не является JSON');
  }
  if (typeof data !== 'object' || data === null) throw new Error('Неверный формат файла');
  const b = data as Partial<Backup>;
  if (b.app !== BACKUP_APP) throw new Error('Это не резервная копия PIXEL PLANNER');
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > BACKUP_VERSION) {
    throw new Error('Копия создана более новой версией приложения');
  }
  if (typeof b.tables !== 'object') throw new Error('В копии нет данных');
  for (const name of SYNC_TABLES) {
    const rows = b.tables[name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || !rows.every(isRow)) throw new Error(`Повреждена таблица «${name}»`);
  }
  return b as Backup;
}

/**
 * replace — стереть всё и загрузить копию;
 * merge — слить: для каждой записи побеждает более свежая (last-write-wins по updatedAt).
 */
export async function importBackup(b: Backup, mode: 'replace' | 'merge'): Promise<number> {
  let count = 0;
  await db.transaction('rw', SYNC_TABLES.map((n) => db.table(n)), async () => {
    for (const name of SYNC_TABLES) {
      const table = db.table<Row, string>(name);
      const rows = (b.tables[name] ?? []) as Row[];
      if (mode === 'replace') {
        await table.clear();
        await table.bulkPut(rows);
        count += rows.length;
        continue;
      }
      const existing = await table.bulkGet(rows.map((r) => r.id));
      const fresh = rows.filter((r, i) => {
        const cur = existing[i];
        return !cur || cur.updatedAt < r.updatedAt;
      });
      await table.bulkPut(fresh);
      count += fresh.length;
    }
  });
  return count;
}
