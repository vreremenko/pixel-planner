import type { Device, DueRow, ScheduleItem, Store, SyncIn, SyncRow, User } from './types.ts';

/** Хранилище в памяти — для тестов; повторяет поведение YDB-реализации. */
export class MemoryStore implements Store {
  private seq = 0;
  private rows = new Map<string, SyncRow & { space: string }>();
  private devices = new Map<string, { endpoint: string; p256dh: string; auth: string; userId: string }>();
  private users = new Map<string, User & { createdAt: number }>();
  private sessions = new Map<string, { userId: string; lastUsedAt: number }>();
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
    this.devices.set(d.id, { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, userId: d.userId });
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
      if (!r.sent || r.fireAt < now - 3 * 86_400_000) this.reminders.delete(k);
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

  async userDelete(id: string): Promise<void> {
    await this.syncDelete(id);
    for (const [did, d] of this.devices) if (d.userId === id) await this.deviceDelete(did);
    for (const [t, s] of this.sessions) if (s.userId === id) this.sessions.delete(t);
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

  sessionDelete(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }

  sessionsDeleteOthers(userId: string, keepTokenHash: string): Promise<void> {
    for (const [t, s] of this.sessions) if (s.userId === userId && t !== keepTokenHash) this.sessions.delete(t);
    return Promise.resolve();
  }
}
