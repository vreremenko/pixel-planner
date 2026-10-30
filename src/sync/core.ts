/*
 * Синхронизация между устройствами: чистая логика без сети и интерфейса.
 * Каждая запись уходит на сервер целиком; при конфликте побеждает более свежий updatedAt
 * (удаления переносятся как записи с deletedAt). Сеть подставляется через Transport.
 */
import type { PlannerDB } from '../data/db';

/** Таблицы, которые ездят между устройствами. Настройки и журнал напоминаний — свои на каждом устройстве. */
export const SYNCED_TABLES = ['tasks', 'series', 'overrides', 'habits', 'habitLogs'] as const;
const SYNCED = new Set<string>(SYNCED_TABLES);

export interface WireRecord {
  t: string;
  id: string;
  u: number;
  d: string;
}

export interface SyncState {
  /** Аккаунт, с которым синхронизируемся. */
  userId: string;
  /** Номер последней записи сервера, которую это устройство уже забрало. */
  cursor: number;
  /** Локальное время начала последней полной отправки: новее него — ещё не отправлено. */
  pushedSince: number;
  lastAt?: number;
  lastError?: string;
}

export interface Transport {
  pull(after: number): Promise<{ records: WireRecord[]; cursor: number; more: boolean }>;
  push(records: WireRecord[]): Promise<void>;
}

const PUSH_CHUNK = 250;
/** Тело запроса не больше ~400 КБ (сервер принимает до 900 КБ). */
const PUSH_CHUNK_BYTES = 400_000;

/** Разбить записи на пачки по числу и по размеру; запись крупнее лимита уходит одна. */
export function chunkRecords(records: WireRecord[], maxCount = PUSH_CHUNK, maxBytes = PUSH_CHUNK_BYTES): WireRecord[][] {
  const out: WireRecord[][] = [];
  let cur: WireRecord[] = [];
  let bytes = 0;
  for (const r of records) {
    if (cur.length > 0 && (cur.length >= maxCount || bytes + r.d.length > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += r.d.length;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}
type Row = { id: string; updatedAt: number } & Record<string, unknown>;

/** Записи, изменённые с момента since и ещё не отправленные. echo — записи, только что полученные с сервера. */
export async function collectChanges(db: PlannerDB, since: number, echo: Map<string, number> = new Map()): Promise<WireRecord[]> {
  const out: WireRecord[] = [];
  for (const t of SYNCED_TABLES) {
    const rows = (await db.table<Row, string>(t).where('updatedAt').above(since - 1).toArray()).filter(
      (r) => echo.get(`${t}:${r.id}`) !== r.updatedAt,
    );
    for (const r of rows) out.push({ t, id: r.id, u: r.updatedAt, d: JSON.stringify(r) });
  }
  return out.sort((a, b) => a.u - b.u);
}

function parseRemote(rec: WireRecord): Row | null {
  if (!SYNCED.has(rec.t)) return null;
  try {
    const row = JSON.parse(rec.d) as unknown;
    if (typeof row !== 'object' || row === null) return null;
    const r = row as Row;
    return r.id === rec.id && typeof r.updatedAt === 'number' ? r : null;
  } catch {
    return null;
  }
}

/** Применить полученные записи: чужая запись заменяет свою, только если она свежее. Возвращает, сколько изменено. */
export async function applyRemote(db: PlannerDB, records: WireRecord[], echo: Map<string, number> = new Map()): Promise<number> {
  const byTable = new Map<string, Row[]>();
  for (const rec of records) {
    const row = parseRemote(rec);
    if (!row) continue;
    byTable.set(rec.t, [...(byTable.get(rec.t) ?? []), row]);
  }
  let changed = 0;
  await db.transaction('rw', SYNCED_TABLES.map((t) => db.table(t)), async () => {
    for (const [t, rows] of byTable) {
      const table = db.table<Row, string>(t);
      const current = await table.bulkGet(rows.map((r) => r.id));
      const fresh = rows.filter((r, i) => {
        const cur = current[i];
        return !cur || cur.updatedAt < r.updatedAt;
      });
      for (const r of fresh) echo.set(`${t}:${r.id}`, r.updatedAt);
      await table.bulkPut(fresh);
      changed += fresh.length;
    }
  });
  return changed;
}

export interface SyncResult {
  state: SyncState;
  pulled: number;
  pushed: number;
}

/** Один проход: сначала отправить своё (чтобы изменение ушло за один запрос), затем забрать новое. Бросает при сетевой ошибке — состояние не двигается. */
export async function syncOnce(db: PlannerDB, state: SyncState, transport: Transport, echo: Map<string, number> = new Map(), now = Date.now()): Promise<SyncResult> {
  const changes = await collectChanges(db, state.pushedSince, echo);
  for (const chunk of chunkRecords(changes)) await transport.push(chunk);

  let cursor = state.cursor;
  let pulled = 0;
  for (let more = true; more; ) {
    const page = await transport.pull(cursor);
    pulled += await applyRemote(db, page.records, echo);
    more = page.more && page.cursor > cursor;
    cursor = page.cursor;
  }

  return { state: { ...state, cursor, pushedSince: now, lastAt: now, lastError: undefined }, pulled, pushed: changes.length };
}
