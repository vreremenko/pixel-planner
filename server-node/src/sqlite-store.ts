import { DatabaseSync } from 'node:sqlite';
import type { ActivityRow, AdminRecordRow, AdminUserRow, CodeKind, Device, DueRow, EmailCode, ScheduleItem, Store, SyncIn, SyncRow, TelegramCode, User } from './types.ts';

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
      CREATE TABLE IF NOT EXISTS email_codes (
        user_id TEXT NOT NULL, kind TEXT NOT NULL, code_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL, sent_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, kind)
      );
      CREATE TABLE IF NOT EXISTS tg_codes (
        code_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT, status TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activity (day TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (day, user_id)) WITHOUT ROWID;
    `);
    // Устройства раньше не принадлежали пользователям: добавляем владельца, а старые без владельца убираем
    const cols = this.db.prepare('PRAGMA table_info(devices)').all() as unknown as { name: string }[];
    if (!cols.some((c) => c.name === 'user_id')) this.db.exec('ALTER TABLE devices ADD COLUMN user_id TEXT');
    const sessionCols = this.db.prepare('PRAGMA table_info(sessions)').all() as unknown as { name: string }[];
    if (!sessionCols.some((c) => c.name === 'app_version')) this.db.exec('ALTER TABLE sessions ADD COLUMN app_version TEXT');
    const userCols = this.db.prepare('PRAGMA table_info(users)').all() as unknown as { name: string }[];
    if (!userCols.some((c) => c.name === 'email_verified_at')) this.db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER');
    if (!userCols.some((c) => c.name === 'telegram_id')) this.db.exec('ALTER TABLE users ADD COLUMN telegram_id TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_telegram ON users (telegram_id) WHERE telegram_id IS NOT NULL');
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

  private user(where: 'id' | 'email' | 'telegram_id', value: string): User | null {
    const r = this.db.prepare(`SELECT id, email, pass_hash AS passHash, email_verified_at AS verifiedAt, telegram_id AS telegramId FROM users WHERE ${where} = ?`).get(value) as (User & { verifiedAt: number | null }) | undefined;
    return r ? { id: r.id, email: r.email, passHash: r.passHash, emailVerified: r.verifiedAt !== null, telegramId: r.telegramId ?? null } : null;
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

  userSetEmail(id: string, email: string, passHash: string): Promise<boolean> {
    try {
      this.db.prepare('UPDATE users SET email = ?, pass_hash = ?, email_verified_at = NULL WHERE id = ?').run(email, passHash, id);
      return Promise.resolve(true);
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) return Promise.resolve(false);
      throw e;
    }
  }

  userSetVerified(id: string, now: number): Promise<void> {
    this.db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(now, id);
    return Promise.resolve();
  }

  userByTelegram(telegramId: string): Promise<User | null> {
    return Promise.resolve(this.user('telegram_id', telegramId));
  }

  userSetTelegram(id: string, telegramId: string | null): Promise<void> {
    this.db.prepare('UPDATE users SET telegram_id = ? WHERE id = ?').run(telegramId, id);
    return Promise.resolve();
  }

  tgCodeSet(c: TelegramCode): Promise<void> {
    // Заодно убираем просроченные: кодов мало, отдельная уборка не нужна
    this.db.prepare('DELETE FROM tg_codes WHERE expires_at < ?').run(c.expiresAt - 86_400_000);
    this.db.prepare('INSERT OR REPLACE INTO tg_codes (code_hash, kind, user_id, status, expires_at) VALUES (?, ?, ?, ?, ?)').run(c.codeHash, c.kind, c.userId, c.status, c.expiresAt);
    return Promise.resolve();
  }

  tgCodeGet(codeHash: string): Promise<TelegramCode | null> {
    const r = this.db.prepare('SELECT code_hash AS codeHash, kind, user_id AS userId, status, expires_at AS expiresAt FROM tg_codes WHERE code_hash = ?').get(codeHash) as TelegramCode | undefined;
    return Promise.resolve(r ?? null);
  }

  tgCodeDelete(codeHash: string): Promise<void> {
    this.db.prepare('DELETE FROM tg_codes WHERE code_hash = ?').run(codeHash);
    return Promise.resolve();
  }

  userDelete(id: string): Promise<void> {
    this.tx(() => {
      this.db.prepare('DELETE FROM sync_records WHERE space = ?').run(id);
      this.db.prepare('DELETE FROM sync_spaces WHERE space = ?').run(id);
      this.db.prepare('DELETE FROM reminders WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)').run(id);
      this.db.prepare('DELETE FROM devices WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM activity WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM email_codes WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM tg_codes WHERE user_id = ?').run(id);
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

  sessionSetVersion(tokenHash: string, version: string): Promise<void> {
    this.db.prepare('UPDATE sessions SET app_version = ? WHERE token_hash = ?').run(version, tokenHash);
    return Promise.resolve();
  }

  sessionDelete(tokenHash: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return Promise.resolve();
  }

  sessionsDeleteOthers(userId: string, keepTokenHash: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, keepTokenHash);
    return Promise.resolve();
  }

  sessionsDeleteAll(userId: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    return Promise.resolve();
  }

  codeSet(c: EmailCode): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO email_codes (user_id, kind, code_hash, expires_at, sent_at, attempts) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.userId, c.kind, c.codeHash, c.expiresAt, c.sentAt, c.attempts);
    return Promise.resolve();
  }

  codeGet(userId: string, kind: CodeKind): Promise<EmailCode | null> {
    const r = this.db
      .prepare('SELECT user_id AS userId, kind, code_hash AS codeHash, expires_at AS expiresAt, sent_at AS sentAt, attempts FROM email_codes WHERE user_id = ? AND kind = ?')
      .get(userId, kind) as EmailCode | undefined;
    return Promise.resolve(r ?? null);
  }

  codeAttempt(userId: string, kind: CodeKind): Promise<void> {
    this.db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ? AND kind = ?').run(userId, kind);
    return Promise.resolve();
  }

  codeDelete(userId: string, kind: CodeKind): Promise<void> {
    this.db.prepare('DELETE FROM email_codes WHERE user_id = ? AND kind = ?').run(userId, kind);
    return Promise.resolve();
  }

  activityTouch(userId: string, day: string): Promise<void> {
    this.db.prepare('INSERT OR IGNORE INTO activity (day, user_id) VALUES (?, ?)').run(day, userId);
    return Promise.resolve();
  }

  activitySince(day: string): Promise<ActivityRow[]> {
    return Promise.resolve(this.db.prepare('SELECT user_id AS userId, day FROM activity WHERE day >= ?').all(day) as unknown as ActivityRow[]);
  }

  adminUsers(): Promise<AdminUserRow[]> {
    const rows = this.db
      .prepare(
        `SELECT u.id AS id, u.email AS email, u.created_at AS createdAt, u.email_verified_at IS NOT NULL AS emailVerified, u.telegram_id IS NOT NULL AS telegram,
                (SELECT MAX(last_used_at) FROM sessions s WHERE s.user_id = u.id) AS lastSeen,
                (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions,
                (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS pushDevices,
                (SELECT app_version FROM sessions s WHERE s.user_id = u.id AND app_version IS NOT NULL ORDER BY last_used_at DESC LIMIT 1) AS appVersion
         FROM users u`,
      )
      .all() as unknown as (Omit<AdminUserRow, 'emailVerified' | 'telegram'> & { emailVerified: number; telegram: number })[];
    return Promise.resolve(rows.map((r) => ({ ...r, emailVerified: r.emailVerified === 1, telegram: r.telegram === 1 })));
  }

  adminRecords(recentSince: number): Promise<AdminRecordRow[]> {
    // Содержимое записи не читаем: удалённую видно по служебному полю в тексте
    const rows = this.db
      .prepare(
        `SELECT space AS userId, tbl AS "table", COUNT(*) AS records, SUM(updated_at >= ?) AS recent
         FROM sync_records WHERE data NOT LIKE '%"deletedAt":%' GROUP BY space, tbl`,
      )
      .all(recentSince) as unknown as AdminRecordRow[];
    return Promise.resolve(rows);
  }
}
