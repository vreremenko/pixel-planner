/*
 * Синхронизация между устройствами: чистая логика без сети и интерфейса.
 * Каждая запись уходит на сервер целиком; при конфликте побеждает более свежий updatedAt
 * (удаления переносятся как записи с deletedAt). Сеть подставляется через Transport.
 */
import type { PlannerDB } from '../data/db';

/** Таблицы, которые ездят между устройствами. Настройки и журнал напоминаний — свои на каждом устройстве. */
export const SYNCED_TABLES = ['tasks', 'series', 'overrides', 'habits', 'habitLogs', 'xp', 'achievements'] as const;
const SYNCED = new Set<string>(SYNCED_TABLES);

export interface WireRecord {
  t: string;
  id: string;
  u: number;
  d: string;
}

export interface SyncState {
  key: string;
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

export const PUSH_CHUNK = 250;
export const KEY_PREFIX = 'pixelplanner-sync:';
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

export const isValidKey = (k: string): boolean => KEY_RE.test(k);

/** 32 случайных байта в base64url — 43 символа. */
export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Что зашито в QR-код. */
export const keyToPairingText = (key: string): string => KEY_PREFIX + key;

/** Достаёт ключ из отсканированного или вставленного текста; null — это не ключ. */
export function parsePairingText(text: string): string | null {
  const t = text.trim();
  const key = t.startsWith(KEY_PREFIX) ? t.slice(KEY_PREFIX.length) : t;
  return isValidKey(key) ? key : null;
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

/** Один проход: забрать новое с сервера, затем отправить своё. Бросает при сетевой ошибке — состояние не двигается. */
export async function syncOnce(db: PlannerDB, state: SyncState, transport: Transport, echo: Map<string, number> = new Map(), now = Date.now()): Promise<SyncResult> {
  let cursor = state.cursor;
  let pulled = 0;
  for (let more = true; more; ) {
    const page = await transport.pull(cursor);
    pulled += await applyRemote(db, page.records, echo);
    more = page.more && page.cursor > cursor;
    cursor = page.cursor;
  }

  const changes = await collectChanges(db, state.pushedSince, echo);
  for (let i = 0; i < changes.length; i += PUSH_CHUNK) await transport.push(changes.slice(i, i + PUSH_CHUNK));

  return { state: { ...state, cursor, pushedSince: now, lastAt: now, lastError: undefined }, pulled, pushed: changes.length };
}
