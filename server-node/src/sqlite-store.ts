import { DatabaseSync } from 'node:sqlite';
import type { Device, DueRow, ScheduleItem, Store, SyncIn, SyncRow, User } from './types.ts';

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
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, device TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
    `);
    // Устройства раньше не принадлежали пользователям: добавляем владельца, а старые без владельца убираем
    const cols = this.db.prepare('PRAGMA table_info(devices)').all() as unknown as { name: string }[];
    if (!cols.some((c) => c.name === 'user_id')) this.db.exec('ALTER TABLE devices ADD COLUMN user_id TEXT');
    this.db.exec('DELETE FROM reminders WHERE device_id IN (SELECT id FROM devices WHERE user_id IS NULL)');
    this.db.exec('DELETE FROM devices WHERE user_id IS NULL');
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

  deviceOwner(id: string): Promise<string | null> {
    const r = this.db.prepare('SELECT user_id FROM devices WHERE id = ?').get(id) as { user_id: string } | undefined;
    return Promise.resolve(r?.user_id ?? null);
  }

  devicesOfUser(userId: string): Promise<string[]> {
    const rows = this.db.prepare('SELECT id FROM devices WHERE user_id = ?').all(userId) as unknown as { id: string }[];
    return Promise.resolve(rows.map((r) => r.id));
  }

  deviceGet(id: string) {
    const r = this.db.prepare('SELECT endpoint, p256dh, auth FROM devices WHERE id = ?').get(id) as { endpoint: string; p256dh: string; auth: string } | undefined;
    return Promise.resolve(r ?? null);
  }

  deviceUpsert(d: Device): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO devices (id, user_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?1, ?6, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, updated_at = ?5`,
      )
      .run(d.id, d.endpoint, d.p256dh, d.auth, d.now, d.userId);
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

  userCreate(u: User & { now: number }): Promise<boolean> {
    try {
      this.db.prepare('INSERT INTO users (id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(u.id, u.email, u.passHash, u.now);
      return Promise.resolve(true);
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) return Promise.resolve(false);
      throw e;
    }
  }

  private user(where: 'id' | 'email', value: string): User | null {
    const r = this.db.prepare(`SELECT id, email, pass_hash AS passHash FROM users WHERE ${where} = ?`).get(value) as User | undefined;
    return r ?? null;
  }

  userByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.user('email', email));
  }

  userById(id: string): Promise<User | null> {
    return Promise.resolve(this.user('id', id));
  }

  userSetPassword(id: string, passHash: string): Promise<void> {
    this.db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(passHash, id);
    return Promise.resolve();
  }

  userDelete(id: string): Promise<void> {
    this.tx(() => {
      this.db.prepare('DELETE FROM sync_records WHERE space = ?').run(id);
      this.db.prepare('DELETE FROM sync_spaces WHERE space = ?').run(id);
      this.db.prepare('DELETE FROM reminders WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)').run(id);
      this.db.prepare('DELETE FROM devices WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    return Promise.resolve();
  }

  sessionCreate(s: { tokenHash: string; userId: string; device: string; now: number }): Promise<void> {
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, device, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)').run(s.tokenHash, s.userId, s.device, s.now, s.now);
    return Promise.resolve();
  }

  sessionUser(tokenHash: string, now: number, maxIdleMs: number): Promise<string | null> {
    const r = this.db.prepare('SELECT user_id, last_used_at FROM sessions WHERE token_hash = ?').get(tokenHash) as { user_id: string; last_used_at: number } | undefined;
    if (!r || now - r.last_used_at > maxIdleMs) return Promise.resolve(null);
    // Время использования обновляем не чаще раза в час, чтобы не писать в базу на каждый запрос
    if (now - r.last_used_at > 3_600_000) this.db.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').run(now, tokenHash);
    return Promise.resolve(r.user_id);
  }

  sessionDelete(tokenHash: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return Promise.resolve();
  }

  sessionsDeleteOthers(userId: string, keepTokenHash: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, keepTokenHash);
    return Promise.resolve();
  }
}
