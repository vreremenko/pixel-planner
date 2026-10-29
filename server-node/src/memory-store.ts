import type { Device, DueRow, ScheduleItem, Store, SyncIn, SyncRow } from './types.ts';

/** Хранилище в памяти — для тестов; повторяет поведение YDB-реализации. */
export class MemoryStore implements Store {
  private seq = 0;
  private rows = new Map<string, SyncRow & { space: string }>();
  private devices = new Map<string, { endpoint: string; p256dh: string; auth: string }>();
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

  deviceExists(id: string): Promise<boolean> {
    return Promise.resolve(this.devices.has(id));
  }

  deviceGet(id: string) {
    return Promise.resolve(this.devices.get(id) ?? null);
  }

  deviceUpsert(d: Device): Promise<void> {
    this.devices.set(d.id, { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth });
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
      out.push({ ...r, ...dev });
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
}
