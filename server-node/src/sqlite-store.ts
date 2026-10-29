import { DatabaseSync } from 'node:sqlite';
import type { Device, DueRow, ScheduleItem, Store, SyncIn, SyncRow } from './types.ts';

const DAY = 86_400_000;

type Row = Record<string, unknown>;

/** Боевое хранилище на SQLite (встроенный модуль Node.js node:sqlite). Один файл на диске. */
export class SqliteStore implements Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS sync_records (
        space TEXT NOT NULL, tbl TEXT NOT NULL, rid TEXT NOT NULL,
        seq INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (space, tbl, rid)
      );
      CREATE INDEX IF NOT EXISTS sync_records_seq ON sync_records (space, seq);
      CREATE TABLE IF NOT EXISTS sync_spaces (space TEXT PRIMARY KEY, seq INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reminders (
        device_id TEXT NOT NULL, key TEXT NOT NULL, fire_at INTEGER NOT NULL, kind TEXT NOT NULL,
        ref TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (device_id, key)
      );
      CREATE INDEX IF NOT EXISTS reminders_due ON reminders (sent, fire_at);
    `);
  }

  close(): void {
    this.db.close();
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  syncPull(space: string, after: number, limit: number): Promise<SyncRow[]> {
    const rows = this.db
      .prepare('SELECT seq, tbl AS t, rid AS id, updated_at AS u, data AS d FROM sync_records WHERE space = ? AND seq > ? ORDER BY seq LIMIT ?')
      .all(space, after, limit) as unknown as SyncRow[];
    return Promise.resolve(rows);
  }

  syncPush(space: string, records: SyncIn[]): Promise<void> {
    this.tx(() => {
      const get = this.db.prepare('SELECT updated_at FROM sync_records WHERE space = ? AND tbl = ? AND rid = ?');
      const put = this.db.prepare('INSERT OR REPLACE INTO sync_records (space, tbl, rid, seq, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)');
      let seq = Number((this.db.prepare('SELECT seq FROM sync_spaces WHERE space = ?').get(space) as Row | undefined)?.seq ?? 0);
      const start = seq;
      for (const r of records) {
        const cur = get.get(space, r.t, r.id) as Row | undefined;
        if (cur && Number(cur.updated_at) >= r.u) continue;
        put.run(space, r.t, r.id, ++seq, r.u, r.d);
      }
      if (seq !== start) this.db.prepare('INSERT OR REPLACE INTO sync_spaces (space, seq) VALUES (?, ?)').run(space, seq);
    });
    return Promise.resolve();
  }

  syncDelete(space: string): Promise<void> {
    this.tx(() => {
      this.db.prepare('DELETE FROM sync_records WHERE space = ?').run(space);
      this.db.prepare('DELETE FROM sync_spaces WHERE space = ?').run(space);
    });
    return Promise.resolve();
  }

  deviceExists(id: string): Promise<boolean> {
    return Promise.resolve(this.db.prepare('SELECT 1 FROM devices WHERE id = ?').get(id) !== undefined);
  }

  deviceGet(id: string) {
    const r = this.db.prepare('SELECT endpoint, p256dh, auth FROM devices WHERE id = ?').get(id) as { endpoint: string; p256dh: string; auth: string } | undefined;
    return Promise.resolve(r ?? null);
  }

  deviceUpsert(d: Device): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO devices (id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, updated_at = ?5`,
      )
      .run(d.id, d.endpoint, d.p256dh, d.auth, d.now);
    return Promise.resolve();
  }

  deviceDelete(id: string): Promise<void> {
    this.tx(() => {
      this.db.prepare('DELETE FROM reminders WHERE device_id = ?').run(id);
      this.db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    });
    return Promise.resolve();
  }

  scheduleReplace(deviceId: string, items: ScheduleItem[], now: number): Promise<void> {
    this.tx(() => {
      this.db.prepare('DELETE FROM reminders WHERE device_id = ? AND (sent = 0 OR fire_at < ?)').run(deviceId, now - 3 * DAY);
      // Уже отправленные с тем же ключом остаются и не дублируются
      const ins = this.db.prepare('INSERT OR IGNORE INTO reminders (device_id, key, fire_at, kind, ref, date, title, body, sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)');
      for (const i of items) ins.run(deviceId, i.key, i.fireAt, i.kind, i.ref, i.date, i.title, i.body);
    });
    return Promise.resolve();
  }

  reminderSnooze(deviceId: string, i: ScheduleItem): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO reminders (device_id, key, fire_at, kind, ref, date, title, body, sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
      .run(deviceId, i.key, i.fireAt, i.kind, i.ref, i.date, i.title, i.body);
    return Promise.resolve();
  }

  dueReminders(now: number, limit: number): Promise<DueRow[]> {
    const rows = this.db
      .prepare(
        `SELECT r.device_id AS deviceId, r.key AS key, r.fire_at AS fireAt, r.kind AS kind, r.ref AS ref, r.date AS date, r.title AS title, r.body AS body,
                d.endpoint AS endpoint, d.p256dh AS p256dh, d.auth AS auth
         FROM reminders r JOIN devices d ON d.id = r.device_id
         WHERE r.sent = 0 AND r.fire_at <= ? ORDER BY r.fire_at LIMIT ?`,
      )
      .all(now, limit) as unknown as DueRow[];
    return Promise.resolve(rows);
  }

  markSent(rows: { deviceId: string; key: string }[]): Promise<void> {
    this.tx(() => {
      const up = this.db.prepare('UPDATE reminders SET sent = 1 WHERE device_id = ? AND key = ?');
      for (const r of rows) up.run(r.deviceId, r.key);
    });
    return Promise.resolve();
  }
}
