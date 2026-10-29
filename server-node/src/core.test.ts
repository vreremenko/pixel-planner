import { describe, expect, it } from 'vitest';
import { handle, sendDue, type Deps } from './core.ts';
import { MemoryStore } from './memory-store.ts';
import type { HttpReq } from './types.ts';

const KEY = 'A'.repeat(43);
const OTHER = 'B'.repeat(43);
const DEVICE = '11111111-1111-4111-8111-111111111111';

const mk = (over: Partial<Deps> = {}): Deps => ({ store: new MemoryStore(), env: { ALLOWED_ORIGINS: 'https://site.test', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }, now: () => 1_000_000, ...over });
const req = (method: string, path: string, o: { key?: string; body?: unknown; query?: Record<string, string>; origin?: string } = {}): HttpReq => ({
  method,
  path,
  query: o.query ?? {},
  headers: { ...(o.key ? { authorization: `Bearer ${o.key}` } : {}), ...(o.origin ? { origin: o.origin } : {}) },
  body: o.body === undefined ? '' : JSON.stringify(o.body),
});
const rec = (id: string, u: number, extra = '') => ({ t: 'tasks', id, u, d: JSON.stringify({ id, updatedAt: u, pad: extra }) });
const pull = async (d: Deps, key: string, after = 0) => JSON.parse((await handle(req('GET', 'sync', { key, query: { after: String(after) } }), d)).body) as { records: { id: string; u: number }[]; cursor: number; more: boolean };

describe('синхронизация', () => {
  it('без ключа и с плохим ключом — 401', async () => {
    const d = mk();
    expect((await handle(req('GET', 'sync'), d)).status).toBe(401);
    expect((await handle(req('GET', 'sync', { key: 'short' }), d)).status).toBe(401);
  });

  it('побеждает запись с большим updatedAt, чужие данные не видны', async () => {
    const d = mk();
    await handle(req('PUT', 'sync', { key: KEY, body: { records: [rec('a', 100), rec('b', 100), { t: 'settings', id: 's', u: 1, d: '{}' }] } }), d);
    await handle(req('PUT', 'sync', { key: KEY, body: { records: [rec('a', 50), rec('b', 200)] } }), d);
    const r = await pull(d, KEY);
    expect(r.records.map((x) => `${x.id}:${String(x.u)}`).sort()).toEqual(['a:100', 'b:200']);
    expect((await pull(d, OTHER)).records).toEqual([]);
  });

  it('большой ответ делится на пачки, курсор доводит до конца', async () => {
    const d = mk();
    for (const part of ['a', 'b']) await handle(req('PUT', 'sync', { key: KEY, body: { records: Array.from({ length: 300 }, (_, i) => rec(`${part}${String(i)}`, i + 1, 'x'.repeat(1500))) } }), d);
    let cursor = 0;
    let got = 0;
    let pages = 0;
    for (;;) {
      const res = await handle(req('GET', 'sync', { key: KEY, query: { after: String(cursor) } }), d);
      expect(res.body.length).toBeLessThan(520_000);
      const j = JSON.parse(res.body) as { records: unknown[]; cursor: number; more: boolean };
      got += j.records.length;
      pages++;
      cursor = j.cursor;
      if (!j.more) break;
    }
    expect(got).toBe(600);
    expect(pages).toBeGreaterThan(1);
  });

  it('удаление стирает данные пространства', async () => {
    const d = mk();
    await handle(req('PUT', 'sync', { key: KEY, body: { records: [rec('a', 1)] } }), d);
    await handle(req('DELETE', 'sync', { key: KEY }), d);
    expect((await pull(d, KEY)).records).toEqual([]);
  });
});

describe('служебное', () => {
  it('config отдаёт ключ VAPID', async () => {
    const d = mk();
    expect(JSON.parse((await handle(req('GET', 'config'), d)).body)).toEqual({ vapidPublicKey: 'pub', push: true });
  });

  it('CORS: только для разрешённого источника; OPTIONS — 204', async () => {
    const d = mk();
    expect((await handle(req('GET', 'config', { origin: 'https://site.test' }), d)).headers['access-control-allow-origin']).toBe('https://site.test');
    expect((await handle(req('GET', 'config', { origin: 'https://evil.test' }), d)).headers['access-control-allow-origin']).toBeUndefined();
    const pre = await handle(req('OPTIONS', 'sync', { origin: 'https://site.test' }), d);
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-headers']).toContain('authorization');
  });
});

describe('push', () => {
  const sub = { subscription: { endpoint: 'https://push.test/x', keys: { p256dh: 'k', auth: 'a' } } };
  const item = (key: string, fireAt: number) => ({ key, fireAt, kind: 'task', ref: 'r', date: '2026-01-01', title: 'Позвонить', body: 'в 19:00' });

  it('устройство → расписание → рассылка наступивших, отправленное не повторяется', async () => {
    const sent: string[] = [];
    const d = mk({ send: (_e, _to, data) => (sent.push((data as { key: string }).key), Promise.resolve({ status: 201, detail: '' })) });
    expect((await handle(req('PUT', `devices/${DEVICE}`, { body: sub }), d)).status).toBe(200);
    expect((await handle(req('PUT', `devices/${DEVICE}/schedule`, { body: { items: [item('a', 900_000), item('b', 2_000_000), { bad: 1 }] } }), d)).body).toContain('"count":2');
    expect(await sendDue(d)).toBe(1);
    expect(sent).toEqual(['a']);
    expect(await sendDue(d)).toBe(0);
  });

  it('устройство, которое сервис забыл (410), удаляется', async () => {
    const d = mk({ send: () => Promise.resolve({ status: 410, detail: '' }) });
    await handle(req('PUT', `devices/${DEVICE}`, { body: sub }), d);
    await handle(req('PUT', `devices/${DEVICE}/schedule`, { body: { items: [item('a', 900_000)] } }), d);
    await sendDue(d);
    expect((await handle(req('PUT', `devices/${DEVICE}/schedule`, { body: { items: [] } }), d)).status).toBe(404);
  });

  it('временная ошибка (503) — повтор в следующую минуту', async () => {
    let status = 503;
    const d = mk({ send: () => Promise.resolve({ status, detail: '' }) });
    await handle(req('PUT', `devices/${DEVICE}`, { body: sub }), d);
    await handle(req('PUT', `devices/${DEVICE}/schedule`, { body: { items: [item('a', 900_000)] } }), d);
    expect(await sendDue(d)).toBe(0);
    status = 201;
    expect(await sendDue(d)).toBe(1);
  });

  it('«отложить» создаёт новое напоминание, неизвестное устройство — 404', async () => {
    const d = mk();
    expect((await handle(req('POST', `devices/${DEVICE}/snooze`, { body: item('a', 1) }), d)).status).toBe(404);
    await handle(req('PUT', `devices/${DEVICE}`, { body: sub }), d);
    expect((await handle(req('POST', `devices/${DEVICE}/snooze`, { body: item('a', 900_000) }), d)).status).toBe(200);
    const sent: string[] = [];
    const d2 = { ...d, send: (_e: unknown, _t: unknown, data: unknown) => (sent.push((data as { key: string }).key), Promise.resolve({ status: 201, detail: '' })) };
    await sendDue(d2);
    expect(sent).toEqual(['a']);
  });
});
