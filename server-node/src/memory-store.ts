import type { ActivityRow, AdminRecordRow, AdminUserRow, ApiKeyInfo, CodeKind, Device, DeviceStatus, DueRow, PushEvent, ScheduleMeta, EmailCode, OAuthGrant, ScheduleItem, Store, SyncIn, SyncRow, TelegramCode, User, AiUsage, AiUsageRow } from './types.ts';

/** Хранилище в памяти — для тестов; повторяет поведение YDB-реализации. */
export class MemoryStore implements Store {
  private seq = 0;
  private rows = new Map<string, SyncRow & { space: string }>();
  private devices = new Map<string, { endpoint: string; p256dh: string; auth: string; userId: string; createdAt: number; updatedAt: number; lastOkAt: number | null; lastErrAt: number | null; lastErr: string | null }>();
  private events = new Map<string, PushEvent[]>();
  private scheduleMeta = new Map<string, ScheduleMeta>();
  private users = new Map<string, User & { createdAt: number }>();
  private sessions = new Map<string, { userId: string; lastUsedAt: number; version?: string }>();
  private activity = new Set<string>();
  private codes = new Map<string, EmailCode>();
  private tgCodes = new Map<string, TelegramCode>();
  private apiKeys = new Map<string, ApiKeyInfo & { userId: string; keyHash: string; clientId?: string; refreshHash?: string; expiresAt?: number }>();
  private oauthItems = new Map<string, { data: string; expiresAt: number }>();
  private reminders = new Map<string, ScheduleItem & { deviceId: string; sent: boolean }>();

  syncPull(space: string, after: number, limit: number): Promise<SyncRow[]> {
    const out = [...this.rows.values()]
      .filter((r) => r.space === space && r.seq > after)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map(({ seq, t, id, u, d }) => ({ seq, t, id, u, d }));
    return Promise.resolve(out);
  }

  syncPush(space: string, records: SyncIn[]): Promise<void> {
    for (const r of records) {
      const k = `${space}|${r.t}|${r.id}`;
      const cur = this.rows.get(k);
      if (cur && cur.u >= r.u) continue;
      this.rows.set(k, { space, seq: ++this.seq, t: r.t, id: r.id, u: r.u, d: r.d });
    }
    return Promise.resolve();
  }

  syncCount(space: string): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.space === space).length);
  }

  syncBytes(space: string): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.space === space).reduce((a, r) => a + r.d.length, 0));
  }

  syncSeq(space: string): Promise<number> {
    return Promise.resolve(Math.max(0, ...[...this.rows.values()].filter((r) => r.space === space).map((r) => r.seq)));
  }

  deviceReport(id: string, now: number, error: string | null): Promise<void> {
    const d = this.devices.get(id);
    if (d && error === null) d.lastOkAt = now;
    else if (d) Object.assign(d, { lastErrAt: now, lastErr: error });
    return Promise.resolve();
  }

  devicesStatus(userId: string, now: number): Promise<DeviceStatus[]> {
    const out = [...this.devices]
      .filter(([, d]) => d.userId === userId)
      .map(([id, d]) => {
        const left = [...this.reminders.values()].filter((r) => r.deviceId === id && !r.sent && r.fireAt >= now).map((r) => r.fireAt);
        return { id, endpoint: d.endpoint, createdAt: d.createdAt, updatedAt: d.updatedAt, lastOkAt: d.lastOkAt, lastErrAt: d.lastErrAt, lastErr: d.lastErr, pending: left.length, nextAt: left.length ? Math.min(...left) : null };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return Promise.resolve(out);
  }

  pushEventAdd(userId: string, e: PushEvent): Promise<void> {
    this.events.set(userId, [e, ...(this.events.get(userId) ?? [])].slice(0, 20));
    return Promise.resolve();
  }

  pushEvents(userId: string): Promise<PushEvent[]> {
    return Promise.resolve(this.events.get(userId) ?? []);
  }

  scheduleMetaSet(userId: string, m: { acceptedAt?: number; count?: number; rejectedAt?: number; tz?: string }): Promise<void> {
    const cur = this.scheduleMeta.get(userId) ?? { acceptedAt: null, count: 0, rejectedAt: null, tz: null };
    if (m.tz !== undefined) cur.tz = m.tz;
    if (m.acceptedAt !== undefined) Object.assign(cur, { acceptedAt: m.acceptedAt, count: m.count ?? 0 });
    if (m.rejectedAt !== undefined) cur.rejectedAt = m.rejectedAt;
    this.scheduleMeta.set(userId, cur);
    return Promise.resolve();
  }

  scheduleMetaGet(userId: string): Promise<ScheduleMeta> {
    return Promise.resolve(this.scheduleMeta.get(userId) ?? { acceptedAt: null, count: 0, rejectedAt: null, tz: null });
  }

  usersWithDevices(): Promise<string[]> {
    return Promise.resolve([...new Set([...this.devices.values()].map((v) => v.userId))]);
  }

  syncDelete(space: string): Promise<void> {
    for (const [k, r] of this.rows) if (r.space === space) this.rows.delete(k);
    return Promise.resolve();
  }

  deviceOwner(id: string): Promise<string | null> {
    return Promise.resolve(this.devices.get(id)?.userId ?? null);
  }

  devicesOfUser(userId: string): Promise<string[]> {
    return Promise.resolve([...this.devices].filter(([, v]) => v.userId === userId).map(([id]) => id));
  }

  deviceGet(id: string) {
    const d = this.devices.get(id);
    return Promise.resolve(d ? { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth } : null);
  }

  deviceUpsert(d: Device): Promise<void> {
    for (const [id, other] of this.devices) if (other.endpoint === d.endpoint && id !== d.id) void this.deviceDelete(id);
    const cur = this.devices.get(d.id);
    this.devices.set(d.id, { lastOkAt: null, lastErrAt: null, lastErr: null, createdAt: d.now, ...cur, endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, userId: cur?.userId ?? d.userId, updatedAt: d.now });
    return Promise.resolve();
  }

  deviceDelete(id: string): Promise<void> {
    this.devices.delete(id);
    for (const [k, r] of this.reminders) if (r.deviceId === id) this.reminders.delete(k);
    return Promise.resolve();
  }

  scheduleReplace(deviceId: string, items: ScheduleItem[], now: number): Promise<void> {
    for (const [k, r] of this.reminders) {
      if (r.deviceId !== deviceId) continue;
      if ((!r.sent && r.fireAt > now && !r.key.includes('#snooze')) || r.fireAt < now - 3 * 86_400_000) this.reminders.delete(k);
    }
    for (const it of items) {
      const k = `${deviceId}|${it.key}`;
      if (!this.reminders.has(k)) this.reminders.set(k, { ...it, deviceId, sent: false });
    }
    return Promise.resolve();
  }

  reminderSnooze(deviceId: string, item: ScheduleItem): Promise<void> {
    this.reminders.set(`${deviceId}|${item.key}`, { ...item, deviceId, sent: false });
    return Promise.resolve();
  }

  dueReminders(now: number, limit: number): Promise<DueRow[]> {
    const out: DueRow[] = [];
    for (const r of [...this.reminders.values()].sort((a, b) => a.fireAt - b.fireAt)) {
      const dev = this.devices.get(r.deviceId);
      if (r.sent || r.fireAt > now || !dev) continue;
      out.push({ ...r, endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth });
      if (out.length >= limit) break;
    }
    return Promise.resolve(out);
  }

  markSent(rows: { deviceId: string; key: string }[]): Promise<void> {
    for (const { deviceId, key } of rows) {
      const r = this.reminders.get(`${deviceId}|${key}`);
      if (r) r.sent = true;
    }
    return Promise.resolve();
  }

  userCreate(u: User & { now: number }): Promise<boolean> {
    if ([...this.users.values()].some((x) => x.email === u.email)) return Promise.resolve(false);
    this.users.set(u.id, { id: u.id, email: u.email, passHash: u.passHash, createdAt: u.now });
    return Promise.resolve(true);
  }

  userByEmail(email: string): Promise<User | null> {
    return Promise.resolve([...this.users.values()].find((x) => x.email === email) ?? null);
  }

  userById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  userSetPassword(id: string, passHash: string): Promise<void> {
    const u = this.users.get(id);
    if (u) u.passHash = passHash;
    return Promise.resolve();
  }

  userSetEmail(id: string, email: string, passHash: string): Promise<boolean> {
    if ([...this.users.values()].some((x) => x.email === email && x.id !== id)) return Promise.resolve(false);
    const u = this.users.get(id);
    if (u) Object.assign(u, { email, passHash, emailVerified: false });
    return Promise.resolve(true);
  }

  userSetVerified(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) u.emailVerified = true;
    return Promise.resolve();
  }

  userByTelegram(telegramId: string): Promise<User | null> {
    return Promise.resolve([...this.users.values()].find((x) => x.telegramId === telegramId) ?? null);
  }

  userSetSanctions(id: string, on: boolean): Promise<void> {
    const u = this.users.get(id);
    if (u) u.sanctions = on;
    return Promise.resolve();
  }

  userSetTelegram(id: string, telegramId: string | null): Promise<void> {
    const u = this.users.get(id);
    if (u) u.telegramId = telegramId;
    return Promise.resolve();
  }

  tgCodeSet(c: TelegramCode): Promise<void> {
    this.tgCodes.set(c.codeHash, { ...c });
    return Promise.resolve();
  }

  apiKeyCreate(k: { id: string; userId: string; name: string; keyHash: string; now: number }): Promise<void> {
    this.apiKeys.set(k.id, { id: k.id, userId: k.userId, name: k.name, keyHash: k.keyHash, createdAt: k.now, lastUsedAt: null, oauth: false });
    return Promise.resolve();
  }

  apiKeysOfUser(userId: string): Promise<ApiKeyInfo[]> {
    return Promise.resolve([...this.apiKeys.values()].filter((k) => k.userId === userId).map(({ id, name, createdAt, lastUsedAt, oauth }) => ({ id, name, createdAt, lastUsedAt, oauth })));
  }

  apiKeyDelete(userId: string, id: string): Promise<void> {
    if (this.apiKeys.get(id)?.userId === userId) this.apiKeys.delete(id);
    return Promise.resolve();
  }

  apiKeyUser(keyHash: string, now: number): Promise<string | null> {
    const k = [...this.apiKeys.values()].find((x) => x.keyHash === keyHash);
    if (!k || (k.expiresAt !== undefined && k.expiresAt <= now)) return Promise.resolve(null);
    k.lastUsedAt = now;
    return Promise.resolve(k.userId);
  }

  oauthItemPut(kind: string, id: string, data: string, expiresAt: number): Promise<void> {
    this.oauthItems.set(`${kind}|${id}`, { data, expiresAt });
    return Promise.resolve();
  }

  oauthItemGet(kind: string, id: string, now: number): Promise<string | null> {
    const r = this.oauthItems.get(`${kind}|${id}`);
    return Promise.resolve(r && (r.expiresAt === 0 || r.expiresAt > now) ? r.data : null);
  }

  oauthItemDelete(kind: string, id: string): Promise<void> {
    this.oauthItems.delete(`${kind}|${id}`);
    return Promise.resolve();
  }

  oauthGrantSave(g: OAuthGrant): Promise<void> {
    for (const [k, v] of this.apiKeys) if (v.userId === g.userId && v.clientId === g.clientId) this.apiKeys.delete(k);
    this.apiKeys.set(g.id, { id: g.id, userId: g.userId, name: g.name, keyHash: g.keyHash, createdAt: g.now, lastUsedAt: null, oauth: true, clientId: g.clientId, refreshHash: g.refreshHash, expiresAt: g.expiresAt });
    return Promise.resolve();
  }

  oauthRefresh(refreshHash: string, next: { keyHash: string; refreshHash: string; expiresAt: number }, now: number): Promise<{ userId: string; clientId: string } | null> {
    const k = [...this.apiKeys.values()].find((x) => x.refreshHash === refreshHash);
    if (!k?.clientId) return Promise.resolve(null);
    Object.assign(k, { ...next, lastUsedAt: now });
    return Promise.resolve({ userId: k.userId, clientId: k.clientId });
  }

  tgCodeGet(codeHash: string): Promise<TelegramCode | null> {
    return Promise.resolve(this.tgCodes.get(codeHash) ?? null);
  }

  tgCodeDelete(codeHash: string): Promise<void> {
    this.tgCodes.delete(codeHash);
    return Promise.resolve();
  }

  async userDelete(id: string): Promise<void> {
    await this.syncDelete(id);
    for (const [did, d] of this.devices) if (d.userId === id) await this.deviceDelete(did);
    for (const [t, s] of this.sessions) if (s.userId === id) this.sessions.delete(t);
    for (const a of this.activity) if (a.endsWith(`|${id}`)) this.activity.delete(a);
    for (const [k, c] of this.codes) if (c.userId === id) this.codes.delete(k);
    for (const [k, c] of this.tgCodes) if (c.userId === id) this.tgCodes.delete(k);
    for (const [k, c] of this.apiKeys) if (c.userId === id) this.apiKeys.delete(k);
    this.users.delete(id);
  }

  sessionCreate(s: { tokenHash: string; userId: string; device: string; now: number }): Promise<void> {
    this.sessions.set(s.tokenHash, { userId: s.userId, lastUsedAt: s.now });
    return Promise.resolve();
  }

  sessionUser(tokenHash: string, now: number, maxIdleMs: number): Promise<string | null> {
    const s = this.sessions.get(tokenHash);
    if (!s || now - s.lastUsedAt > maxIdleMs) return Promise.resolve(null);
    s.lastUsedAt = now;
    return Promise.resolve(s.userId);
  }

  sessionSetVersion(tokenHash: string, version: string): Promise<void> {
    const s = this.sessions.get(tokenHash);
    if (s) s.version = version;
    return Promise.resolve();
  }

  sessionDelete(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }

  sessionsDeleteOthers(userId: string, keepTokenHash: string): Promise<void> {
    for (const [t, s] of this.sessions) if (s.userId === userId && t !== keepTokenHash) this.sessions.delete(t);
    return Promise.resolve();
  }

  sessionsDeleteAll(userId: string): Promise<void> {
    for (const [t, s] of this.sessions) if (s.userId === userId) this.sessions.delete(t);
    return Promise.resolve();
  }

  codeSet(c: EmailCode): Promise<void> {
    this.codes.set(`${c.userId}|${c.kind}`, { ...c });
    return Promise.resolve();
  }

  codeGet(userId: string, kind: CodeKind): Promise<EmailCode | null> {
    return Promise.resolve(this.codes.get(`${userId}|${kind}`) ?? null);
  }

  codeAttempt(userId: string, kind: CodeKind): Promise<void> {
    const c = this.codes.get(`${userId}|${kind}`);
    if (c) c.attempts++;
    return Promise.resolve();
  }

  codeDelete(userId: string, kind: CodeKind): Promise<void> {
    this.codes.delete(`${userId}|${kind}`);
    return Promise.resolve();
  }

  activityTouch(userId: string, day: string): Promise<void> {
    this.activity.add(`${day}|${userId}`);
    return Promise.resolve();
  }

  private ai = new Map<string, AiUsageRow>();

  aiUsageAdd(userId: string, day: string, d: Partial<AiUsage>): Promise<void> {
    const key = `${day}|${userId}`;
    const cur = this.ai.get(key) ?? { day, userId, phrases: 0, calls: 0, tokensIn: 0, tokensOut: 0, voice: 0 };
    this.ai.set(key, { ...cur, phrases: cur.phrases + (d.phrases ?? 0), calls: cur.calls + (d.calls ?? 0), tokensIn: cur.tokensIn + (d.tokensIn ?? 0), tokensOut: cur.tokensOut + (d.tokensOut ?? 0), voice: cur.voice + (d.voice ?? 0) });
    return Promise.resolve();
  }

  aiUsageSince(day: string): Promise<AiUsageRow[]> {
    return Promise.resolve([...this.ai.values()].filter((r) => r.day >= day));
  }

  activitySince(day: string): Promise<ActivityRow[]> {
    const rows = [...this.activity].map((a) => {
      const [d = '', userId = ''] = a.split('|');
      return { day: d, userId };
    });
    return Promise.resolve(rows.filter((r) => r.day >= day));
  }

  adminUsers(): Promise<AdminUserRow[]> {
    const sessions = [...this.sessions.values()];
    const devices = [...this.devices.values()];
    return Promise.resolve(
      [...this.users.values()].map((u) => {
        const mine = sessions.filter((s) => s.userId === u.id);
        const appVersion = mine.filter((s) => s.version !== undefined).sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]?.version ?? null;
        return { id: u.id, email: u.email, createdAt: u.createdAt, emailVerified: Boolean(u.emailVerified), telegram: Boolean(u.telegramId), sanctions: Boolean(u.sanctions), lastSeen: mine.length > 0 ? Math.max(...mine.map((s) => s.lastUsedAt)) : null, sessions: mine.length, pushDevices: devices.filter((d) => d.userId === u.id).length, appVersion };
      }),
    );
  }

  adminRecords(recentSince: number): Promise<AdminRecordRow[]> {
    const out = new Map<string, AdminRecordRow>();
    for (const r of this.rows.values()) {
      if (r.d.includes('"deletedAt":')) continue;
      const k = `${r.space}|${r.t}`;
      const row = out.get(k) ?? { userId: r.space, table: r.t, records: 0, recent: 0 };
      row.records++;
      if (r.u >= recentSince) row.recent++;
      out.set(k, row);
    }
    return Promise.resolve([...out.values()]);
  }
}
