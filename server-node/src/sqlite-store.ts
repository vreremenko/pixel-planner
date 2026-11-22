import { DatabaseSync } from 'node:sqlite';
import type { ActivityRow, AdminRecordRow, AdminUserRow, ApiKeyInfo, CodeKind, Device, DeviceStatus, DueRow, PushEvent, ScheduleMeta, EmailCode, OAuthGrant, ScheduleItem, Store, SyncIn, SyncRow, TelegramCode, User, AiUsage, AiUsageRow } from './types.ts';

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
      CREATE TABLE IF NOT EXISTS push_events (user_id TEXT NOT NULL, at INTEGER NOT NULL, device TEXT NOT NULL, text TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS push_events_user ON push_events (user_id, at);
      CREATE TABLE IF NOT EXISTS schedule_meta (user_id TEXT PRIMARY KEY, accepted_at INTEGER, count INTEGER NOT NULL DEFAULT 0, rejected_at INTEGER);
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
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL, last_used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS api_keys_user ON api_keys (user_id);
      CREATE TABLE IF NOT EXISTS oauth_items (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (kind, id)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS activity (day TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (day, user_id)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS ai_usage (
        day TEXT NOT NULL, user_id TEXT NOT NULL, phrases INTEGER NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0,
        tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, voice INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, user_id)
      ) WITHOUT ROWID;
    `);
    // Устройства раньше не принадлежали пользователям: добавляем владельца, а старые без владельца убираем
    const cols = this.db.prepare('PRAGMA table_info(devices)').all() as unknown as { name: string }[];
    if (!cols.some((c) => c.name === 'user_id')) this.db.exec('ALTER TABLE devices ADD COLUMN user_id TEXT');
    if (!cols.some((c) => c.name === 'last_ok_at')) this.db.exec('ALTER TABLE devices ADD COLUMN last_ok_at INTEGER; ALTER TABLE devices ADD COLUMN last_err_at INTEGER; ALTER TABLE devices ADD COLUMN last_err TEXT;');
    const keyCols = this.db.prepare('PRAGMA table_info(api_keys)').all() as unknown as { name: string }[];
    if (!keyCols.some((c) => c.name === 'client_id')) this.db.exec('ALTER TABLE api_keys ADD COLUMN client_id TEXT; ALTER TABLE api_keys ADD COLUMN refresh_hash TEXT; ALTER TABLE api_keys ADD COLUMN expires_at INTEGER;');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS api_keys_refresh ON api_keys (refresh_hash) WHERE refresh_hash IS NOT NULL');
    const sessionCols = this.db.prepare('PRAGMA table_info(sessions)').all() as unknown as { name: string }[];
    if (!sessionCols.some((c) => c.name === 'app_version')) this.db.exec('ALTER TABLE sessions ADD COLUMN app_version TEXT');
    const userCols = this.db.prepare('PRAGMA table_info(users)').all() as unknown as { name: string }[];
    if (!userCols.some((c) => c.name === 'email_verified_at')) this.db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER');
    if (!userCols.some((c) => c.name === 'telegram_id')) this.db.exec('ALTER TABLE users ADD COLUMN telegram_id TEXT');
    if (!userCols.some((c) => c.name === 'sanctions')) this.db.exec('ALTER TABLE users ADD COLUMN sanctions INTEGER NOT NULL DEFAULT 0');
    const metaCols = this.db.prepare('PRAGMA table_info(schedule_meta)').all() as unknown as { name: string }[];
    if (!metaCols.some((c) => c.name === 'tz')) this.db.exec('ALTER TABLE schedule_meta ADD COLUMN tz TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_telegram ON users (telegram_id) WHERE telegram_id IS NOT NULL');
    this.db.exec('DELETE FROM reminders WHERE device_id IN (SELECT id FROM devices WHERE user_id IS NULL)');
    this.db.exec('DELETE FROM devices WHERE user_id IS NULL');
    // Дубли одного адреса подписки, накопившиеся до того, как их стала убирать регистрация: оставляем самую свежую запись
    const dupes = 'SELECT d.id FROM devices d WHERE EXISTS (SELECT 1 FROM devices n WHERE n.endpoint = d.endpoint AND (n.updated_at > d.updated_at OR (n.updated_at = d.updated_at AND n.id > d.id)))';
    this.db.exec(`DELETE FROM reminders WHERE device_id IN (${dupes}); DELETE FROM devices WHERE id IN (${dupes});`);
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

  syncCount(space: string): Promise<number> {
    return Promise.resolve((this.db.prepare('SELECT COUNT(*) AS n FROM sync_records WHERE space = ?').get(space) as { n: number }).n);
  }

  syncBytes(space: string): Promise<number> {
    return Promise.resolve((this.db.prepare('SELECT COALESCE(SUM(LENGTH(data)), 0) AS n FROM sync_records WHERE space = ?').get(space) as { n: number }).n);
  }

  syncSeq(space: string): Promise<number> {
    return Promise.resolve(Number((this.db.prepare('SELECT seq FROM sync_spaces WHERE space = ?').get(space) as Row | undefined)?.seq ?? 0));
  }

  deviceReport(id: string, now: number, error: string | null): Promise<void> {
    if (error === null) this.db.prepare('UPDATE devices SET last_ok_at = ? WHERE id = ?').run(now, id);
    else this.db.prepare('UPDATE devices SET last_err_at = ?, last_err = ? WHERE id = ?').run(now, error.slice(0, 300), id);
    return Promise.resolve();
  }

  devicesStatus(userId: string, now: number): Promise<DeviceStatus[]> {
    const rows = this.db
      .prepare(
        `SELECT d.id AS id, d.endpoint AS endpoint, d.created_at AS createdAt, d.updated_at AS updatedAt,
                d.last_ok_at AS lastOkAt, d.last_err_at AS lastErrAt, d.last_err AS lastErr,
                (SELECT COUNT(*) FROM reminders r WHERE r.device_id = d.id AND r.sent = 0 AND r.fire_at >= ?2) AS pending,
                (SELECT MIN(fire_at) FROM reminders r WHERE r.device_id = d.id AND r.sent = 0 AND r.fire_at >= ?2) AS nextAt
         FROM devices d WHERE d.user_id = ?1 ORDER BY d.updated_at DESC`,
      )
      .all(userId, now) as unknown as DeviceStatus[];
    return Promise.resolve(rows);
  }

  pushEventAdd(userId: string, e: PushEvent): Promise<void> {
    this.tx(() => {
      this.db.prepare('INSERT INTO push_events (user_id, at, device, text) VALUES (?, ?, ?, ?)').run(userId, e.at, e.device, e.text.slice(0, 300));
      this.db.prepare('DELETE FROM push_events WHERE user_id = ?1 AND rowid NOT IN (SELECT rowid FROM push_events WHERE user_id = ?1 ORDER BY at DESC LIMIT 20)').run(userId);
    });
    return Promise.resolve();
  }

  pushEvents(userId: string): Promise<PushEvent[]> {
    return Promise.resolve(this.db.prepare('SELECT at, device, text FROM push_events WHERE user_id = ? ORDER BY at DESC LIMIT 20').all(userId) as unknown as PushEvent[]);
  }

  scheduleMetaSet(userId: string, m: { acceptedAt?: number; count?: number; rejectedAt?: number; tz?: string }): Promise<void> {
    this.db.prepare('INSERT OR IGNORE INTO schedule_meta (user_id) VALUES (?)').run(userId);
    if (m.tz !== undefined) this.db.prepare('UPDATE schedule_meta SET tz = ? WHERE user_id = ?').run(m.tz, userId);
    if (m.acceptedAt !== undefined) this.db.prepare('UPDATE schedule_meta SET accepted_at = ?, count = ? WHERE user_id = ?').run(m.acceptedAt, m.count ?? 0, userId);
    if (m.rejectedAt !== undefined) this.db.prepare('UPDATE schedule_meta SET rejected_at = ? WHERE user_id = ?').run(m.rejectedAt, userId);
    return Promise.resolve();
  }

  scheduleMetaGet(userId: string): Promise<ScheduleMeta> {
    const r = this.db.prepare('SELECT accepted_at AS acceptedAt, count, rejected_at AS rejectedAt, tz FROM schedule_meta WHERE user_id = ?').get(userId) as ScheduleMeta | undefined;
    return Promise.resolve(r ? { acceptedAt: r.acceptedAt, count: r.count, rejectedAt: r.rejectedAt, tz: r.tz } : { acceptedAt: null, count: 0, rejectedAt: null, tz: null });
  }

  usersWithDevices(): Promise<string[]> {
    const rows = this.db.prepare('SELECT DISTINCT user_id FROM devices WHERE user_id IS NOT NULL').all() as unknown as { user_id: string }[];
    return Promise.resolve(rows.map((r) => r.user_id));
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
    this.tx(() => {
      // Один адрес подписки — одно устройство. Приложение могло зарегистрироваться заново под новым номером
      // (потеряло локальные данные, вошли в другой аккаунт): старая запись с тем же адресом слала бы второе уведомление.
      this.db.prepare('DELETE FROM reminders WHERE device_id IN (SELECT id FROM devices WHERE endpoint = ? AND id <> ?)').run(d.endpoint, d.id);
      this.db.prepare('DELETE FROM devices WHERE endpoint = ? AND id <> ?').run(d.endpoint, d.id);
      this.db
        .prepare(
          `INSERT INTO devices (id, user_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?1, ?6, ?2, ?3, ?4, ?5, ?5)
           ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, updated_at = ?5`,
        )
        .run(d.id, d.endpoint, d.p256dh, d.auth, d.now, d.userId);
    });
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
      // Уже наступившие, но ещё не отправленные остаются: приложение пересчитывает расписание «от сейчас» через мгновение
      // после срабатывания, и без этого стирало напоминание раньше, чем рассылка успевала его отправить.
      // Отложенные («#snooze») в расписании приложения не значатся, их тоже не трогаем.
      this.db
        .prepare("DELETE FROM reminders WHERE device_id = ?1 AND ((sent = 0 AND fire_at > ?2 AND key NOT LIKE '%#snooze%') OR fire_at < ?3)")
        .run(deviceId, now, now - 3 * DAY);
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
    const r = this.db.prepare(`SELECT id, email, pass_hash AS passHash, email_verified_at AS verifiedAt, telegram_id AS telegramId, sanctions FROM users WHERE ${where} = ?`).get(value) as (Omit<User, 'sanctions'> & { verifiedAt: number | null; sanctions: number }) | undefined;
    return r ? { id: r.id, email: r.email, passHash: r.passHash, emailVerified: r.verifiedAt !== null, telegramId: r.telegramId ?? null, sanctions: r.sanctions === 1 } : null;
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

  userSetSanctions(id: string, on: boolean): Promise<void> {
    this.db.prepare('UPDATE users SET sanctions = ? WHERE id = ?').run(on ? 1 : 0, id);
    return Promise.resolve();
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

  apiKeyCreate(k: { id: string; userId: string; name: string; keyHash: string; now: number }): Promise<void> {
    this.db.prepare('INSERT INTO api_keys (id, user_id, name, key_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(k.id, k.userId, k.name, k.keyHash, k.now);
    return Promise.resolve();
  }

  apiKeysOfUser(userId: string): Promise<ApiKeyInfo[]> {
    const rows = this.db.prepare('SELECT id, name, created_at AS createdAt, last_used_at AS lastUsedAt, client_id AS clientId FROM api_keys WHERE user_id = ? ORDER BY created_at').all(userId) as unknown as (Omit<ApiKeyInfo, 'oauth'> & { clientId: string | null })[];
    return Promise.resolve(rows.map(({ clientId, ...k }) => ({ ...k, oauth: clientId !== null })));
  }

  apiKeyDelete(userId: string, id: string): Promise<void> {
    this.db.prepare('DELETE FROM api_keys WHERE user_id = ? AND id = ?').run(userId, id);
    return Promise.resolve();
  }

  apiKeyUser(keyHash: string, now: number): Promise<string | null> {
    const r = this.db.prepare('SELECT user_id, last_used_at, expires_at FROM api_keys WHERE key_hash = ?').get(keyHash) as { user_id: string; last_used_at: number | null; expires_at: number | null } | undefined;
    if (!r || (r.expires_at !== null && r.expires_at <= now)) return Promise.resolve(null);
    // Время использования обновляем не чаще раза в час, чтобы не писать в базу на каждый запрос
    if (now - (r.last_used_at ?? 0) > 3_600_000) this.db.prepare('UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?').run(now, keyHash);
    return Promise.resolve(r.user_id);
  }

  oauthItemPut(kind: string, id: string, data: string, expiresAt: number, now: number): Promise<void> {
    this.tx(() => {
      this.db.prepare('DELETE FROM oauth_items WHERE expires_at > 0 AND expires_at < ?').run(now);
      this.db.prepare('INSERT OR REPLACE INTO oauth_items (kind, id, data, expires_at) VALUES (?, ?, ?, ?)').run(kind, id, data, expiresAt);
    });
    return Promise.resolve();
  }

  oauthItemGet(kind: string, id: string, now: number): Promise<string | null> {
    const r = this.db.prepare('SELECT data, expires_at FROM oauth_items WHERE kind = ? AND id = ?').get(kind, id) as { data: string; expires_at: number } | undefined;
    return Promise.resolve(r && (r.expires_at === 0 || r.expires_at > now) ? r.data : null);
  }

  oauthItemDelete(kind: string, id: string): Promise<void> {
    this.db.prepare('DELETE FROM oauth_items WHERE kind = ? AND id = ?').run(kind, id);
    return Promise.resolve();
  }

  oauthGrantSave(g: OAuthGrant): Promise<void> {
    this.tx(() => {
      this.db.prepare('DELETE FROM api_keys WHERE user_id = ? AND client_id = ?').run(g.userId, g.clientId);
      this.db
        .prepare('INSERT INTO api_keys (id, user_id, name, key_hash, created_at, client_id, refresh_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(g.id, g.userId, g.name, g.keyHash, g.now, g.clientId, g.refreshHash, g.expiresAt);
    });
    return Promise.resolve();
  }

  oauthRefresh(refreshHash: string, next: { keyHash: string; refreshHash: string; expiresAt: number }, now: number): Promise<{ userId: string; clientId: string } | null> {
    return Promise.resolve(
      this.tx(() => {
        const r = this.db.prepare('SELECT id, user_id, client_id FROM api_keys WHERE refresh_hash = ?').get(refreshHash) as { id: string; user_id: string; client_id: string } | undefined;
        if (!r) return null;
        this.db.prepare('UPDATE api_keys SET key_hash = ?, refresh_hash = ?, expires_at = ?, last_used_at = ? WHERE id = ?').run(next.keyHash, next.refreshHash, next.expiresAt, now, r.id);
        return { userId: r.user_id, clientId: r.client_id };
      }),
    );
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
      this.db.prepare('DELETE FROM push_events WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM schedule_meta WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM activity WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM email_codes WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM tg_codes WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(id);
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

  aiUsageAdd(userId: string, day: string, d: Partial<AiUsage>): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ai_usage (day, user_id, phrases, calls, tokens_in, tokens_out, voice) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (day, user_id) DO UPDATE SET phrases = phrases + excluded.phrases, calls = calls + excluded.calls,
           tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out, voice = voice + excluded.voice`,
      )
      .run(day, userId, d.phrases ?? 0, d.calls ?? 0, d.tokensIn ?? 0, d.tokensOut ?? 0, d.voice ?? 0);
    return Promise.resolve();
  }

  aiUsageSince(day: string): Promise<AiUsageRow[]> {
    return Promise.resolve(
      this.db.prepare('SELECT day, user_id AS userId, phrases, calls, tokens_in AS tokensIn, tokens_out AS tokensOut, voice FROM ai_usage WHERE day >= ?').all(day) as unknown as AiUsageRow[],
    );
  }

  activitySince(day: string): Promise<ActivityRow[]> {
    return Promise.resolve(this.db.prepare('SELECT user_id AS userId, day FROM activity WHERE day >= ?').all(day) as unknown as ActivityRow[]);
  }

  adminUsers(): Promise<AdminUserRow[]> {
    const rows = this.db
      .prepare(
        `SELECT u.id AS id, u.email AS email, u.created_at AS createdAt, u.email_verified_at IS NOT NULL AS emailVerified, u.telegram_id IS NOT NULL AS telegram, u.sanctions AS sanctions,
                (SELECT MAX(last_used_at) FROM sessions s WHERE s.user_id = u.id) AS lastSeen,
                (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions,
                (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS pushDevices,
                (SELECT app_version FROM sessions s WHERE s.user_id = u.id AND app_version IS NOT NULL ORDER BY last_used_at DESC LIMIT 1) AS appVersion
         FROM users u`,
      )
      .all() as unknown as (Omit<AdminUserRow, 'emailVerified' | 'telegram' | 'sanctions'> & { emailVerified: number; telegram: number; sanctions: number })[];
    return Promise.resolve(rows.map((r) => ({ ...r, emailVerified: r.emailVerified === 1, telegram: r.telegram === 1, sanctions: r.sanctions === 1 })));
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
