import { describe, expect, it } from 'vitest';
import { handle, sendDue, type Deps } from './core.ts';
import { SqliteStore } from './sqlite-store.ts';
import type { HttpReq, ScheduleItem } from './types.ts';

const KEY = 'A'.repeat(43);
const OTHER = 'B'.repeat(43);
const DEVICE = '11111111-1111-4111-8111-111111111111';
const rec = (id: string, u: number, pad = '') => ({ t: 'tasks', id, u, d: JSON.stringify({ id, updatedAt: u, pad }) });
const item = (key: string, fireAt: number): ScheduleItem => ({ key, fireAt, kind: 'task', ref: 'r', date: '2026-01-01', title: 'Позвонить', body: 'в 19:00' });

describe('SqliteStore', () => {
  it('слияние: побеждает свежая запись, чужое пространство пусто, курсор отдаёт новое', async () => {
    const s = new SqliteStore(':memory:');
    await s.syncPush('sp', [rec('a', 100), rec('b', 100)]);
    await s.syncPush('sp', [rec('a', 50), rec('b', 200), rec('c', 5)]);
    const rows = await s.syncPull('sp', 0, 100);
    expect(rows.map((r) => `${r.id}:${String(r.u)}`).sort()).toEqual(['a:100', 'b:200', 'c:5']);
    expect(await s.syncPull('other', 0, 100)).toEqual([]);
    const cursor = rows.at(-1)?.seq ?? 0;
    expect(await s.syncPull('sp', cursor, 100)).toEqual([]);
    await s.syncPush('sp', [rec('d', 9)]);
    expect((await s.syncPull('sp', cursor, 100)).map((r) => r.id)).toEqual(['d']);
    s.close();
  });

  it('большая пачка и удаление пространства', async () => {
    const s = new SqliteStore(':memory:');
    await s.syncPush('sp', Array.from({ length: 500 }, (_, i) => rec(`r${String(i)}`, i + 1)));
    expect((await s.syncPull('sp', 0, 1000)).length).toBe(500);
    await s.syncPush('other', [rec('x', 1)]);
    await s.syncDelete('sp');
    expect(await s.syncPull('sp', 0, 10)).toEqual([]);
    expect((await s.syncPull('other', 0, 10)).length).toBe(1);
    s.close();
  });

  it('напоминания: наступившие, отправленное не повторяется, удаление устройства', async () => {
    const s = new SqliteStore(':memory:');
    await s.deviceUpsert({ id: DEVICE, endpoint: 'https://push.test/x', p256dh: 'k', auth: 'a', now: 1 });
    await s.scheduleReplace(DEVICE, [item('a', 900), item('b', 2000)], 1000);
    expect((await s.dueReminders(1000, 200)).map((d) => d.key)).toEqual(['a']);
    await s.markSent([{ deviceId: DEVICE, key: 'a' }]);
    expect(await s.dueReminders(1000, 200)).toEqual([]);
    await s.scheduleReplace(DEVICE, [item('a', 900), item('c', 950)], 1001);
    expect((await s.dueReminders(1001, 200)).map((d) => d.key)).toEqual(['c']);
    await s.reminderSnooze(DEVICE, item('a#snooze', 5000));
    expect((await s.dueReminders(5000, 200)).map((d) => d.key)).toEqual(['c', 'a#snooze']);
    await s.deviceDelete(DEVICE);
    expect(await s.deviceExists(DEVICE)).toBe(false);
    expect(await s.dueReminders(9999, 200)).toEqual([]);
    s.close();
  });

  it('через HTTP-слой: ключи, постраничная выдача, рассылка', async () => {
    const store = new SqliteStore(':memory:');
    const sent: string[] = [];
    const d: Deps = {
      store,
      env: { ALLOWED_ORIGINS: 'https://site.test', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' },
      now: () => 1_000_000,
      send: (_e, _to, data) => (sent.push((data as { key: string }).key), Promise.resolve({ status: 201, detail: '' })),
    };
    const req = (method: string, path: string, o: { key?: string; body?: unknown; query?: Record<string, string> } = {}): HttpReq => ({
      method, path, query: o.query ?? {}, headers: o.key ? { authorization: `Bearer ${o.key}` } : {}, body: o.body === undefined ? '' : JSON.stringify(o.body),
    });
    expect((await handle(req('GET', 'sync'), d)).status).toBe(401);
    for (const part of ['a', 'b']) await handle(req('PUT', 'sync', { key: KEY, body: { records: Array.from({ length: 300 }, (_, i) => rec(`${part}${String(i)}`, i + 1, 'x'.repeat(1500))) } }), d);
    let cursor = 0;
    let got = 0;
    let pages = 0;
    for (;;) {
      const res = await handle(req('GET', 'sync', { key: KEY, query: { after: String(cursor) } }), d);
      expect(res.body.length).toBeLessThan(520_000);
      pages++;
      const j = JSON.parse(res.body) as { records: unknown[]; cursor: number; more: boolean };
      got += j.records.length;
      cursor = j.cursor;
      if (!j.more) break;
    }
    expect(got).toBe(600);
    expect(pages).toBeGreaterThan(1);
    expect((JSON.parse((await handle(req('GET', 'sync', { key: OTHER }), d)).body) as { records: unknown[] }).records).toEqual([]);
    await handle(req('PUT', `devices/${DEVICE}`, { body: { subscription: { endpoint: 'https://push.test/x', keys: { p256dh: 'k', auth: 'a' } } } }), d);
    await handle(req('PUT', `devices/${DEVICE}/schedule`, { body: { items: [item('a', 900_000), item('b', 2_000_000)] } }), d);
    expect(await sendDue(d)).toBe(1);
    expect(sent).toEqual(['a']);
    expect(await sendDue(d)).toBe(0);
    store.close();
  });
});
