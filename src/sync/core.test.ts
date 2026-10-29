import { beforeEach, describe, expect, it } from 'vitest';
import { PlannerDB } from '../data/db';
import { applyRemote, collectChanges, generateKey, isValidKey, keyToPairingText, parsePairingText, syncOnce, type SyncState, type Transport, type WireRecord } from './core';
import type { Task } from '../domain/types';

/** Сервер в памяти с теми же правилами, что и у Worker. */
function fakeServer() {
  let seq = 0;
  const rows = new Map<string, WireRecord & { seq: number }>();
  const transport: Transport = {
    pull(after) {
      const all = [...rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq);
      const records = all.slice(0, 2);
      return Promise.resolve({ records, cursor: records.at(-1)?.seq ?? after, more: all.length > 2 });
    },
    push(records) {
      for (const r of records) {
        const k = `${r.t}:${r.id}`;
        const cur = rows.get(k);
        if (cur && cur.u >= r.u) continue;
        rows.set(k, { ...r, seq: ++seq });
      }
      return Promise.resolve();
    },
  };
  return { transport, rows };
}

const task = (id: string, title: string, updatedAt: number, extra: Partial<Task> = {}): Task =>
  ({ id, createdAt: 1, updatedAt, title, date: '2026-01-05', priority: 'low', done: false, order: 0, tags: [], wasInBacklog: false, postponedCount: 0, ...extra });

const fresh = (): SyncState => ({ key: generateKey(), cursor: 0, pushedSince: 0 });

describe('ключ синхронизации', () => {
  it('генерируется валидным и разбирается из QR-текста', () => {
    const k = generateKey();
    expect(isValidKey(k)).toBe(true);
    expect(parsePairingText(keyToPairingText(k))).toBe(k);
    expect(parsePairingText(`  ${k}\n`)).toBe(k);
    expect(parsePairingText('hello')).toBeNull();
    expect(parsePairingText(k.slice(1))).toBeNull();
  });
});

describe('синхронизация двух устройств', () => {
  let a: PlannerDB;
  let b: PlannerDB;
  beforeEach(() => {
    a = new PlannerDB(`a-${crypto.randomUUID()}`);
    b = new PlannerDB(`b-${crypto.randomUUID()}`);
  });

  it('запись с одного устройства появляется на другом', async () => {
    const srv = fakeServer();
    await a.tasks.put(task('t1', 'купить хлеб', 100));
    const sa = (await syncOnce(a, fresh(), srv.transport)).state;
    expect(sa.lastAt).toBeDefined();
    const sb = await syncOnce(b, { ...fresh(), key: sa.key }, srv.transport);
    expect(sb.pulled).toBe(1);
    expect((await b.tasks.get('t1'))?.title).toBe('купить хлеб');
  });

  it('побеждает более свежая правка, удаление тоже переносится', async () => {
    const srv = fakeServer();
    await a.tasks.bulkPut([task('t1', 'старое', 100), task('t2', 'будет удалено', 100)]);
    const sa = (await syncOnce(a, fresh(), srv.transport, new Map(), 150)).state;
    let sb = (await syncOnce(b, fresh(), srv.transport, new Map(), 160)).state;

    await b.tasks.put(task('t1', 'правка на b', 200));
    await a.tasks.put(task('t2', 'будет удалено', 300, { deletedAt: 300 }));
    sb = (await syncOnce(b, sb, srv.transport, new Map(), 250)).state;
    await syncOnce(a, sa, srv.transport, new Map(), 350);
    await syncOnce(b, sb, srv.transport, new Map(), 400);

    expect((await a.tasks.get('t1'))?.title).toBe('правка на b');
    expect((await b.tasks.get('t2'))?.deletedAt).toBe(300);
  });

  it('старая запись не затирает свежую', async () => {
    const srv = fakeServer();
    await a.tasks.put(task('t1', 'свежее', 500));
    await applyRemote(a, [{ t: 't1', id: 't1', u: 100, d: JSON.stringify(task('t1', 'старое', 100)) }]);
    expect((await a.tasks.get('t1'))?.title).toBe('свежее');
    await syncOnce(a, fresh(), srv.transport);
    expect(srv.rows.get('tasks:t1')?.u).toBe(500);
  });

  it('второй проход не отправляет то же самое и не гоняет полученное обратно', async () => {
    const srv = fakeServer();
    await a.tasks.put(task('t1', 'x', 100));
    const echo = new Map<string, number>();
    const first = await syncOnce(a, fresh(), srv.transport, echo, 1_000);
    expect(first.pushed).toBe(1);
    const second = await syncOnce(a, first.state, srv.transport, echo, 2_000);
    expect(second.pushed).toBe(0);

    await b.tasks.put(task('t2', 'с b', 5_000));
    const sb = await syncOnce(b, fresh(), srv.transport, new Map(), 5_100);
    const third = await syncOnce(a, second.state, srv.transport, echo, 6_000);
    expect(third.pulled).toBe(1);
    const fourth = await syncOnce(a, third.state, srv.transport, echo, 7_000);
    expect(fourth.pushed).toBe(0);
    expect(sb.pushed).toBe(1);
  });

  it('много записей приходят постранично', async () => {
    const srv = fakeServer();
    await a.tasks.bulkPut(Array.from({ length: 5 }, (_, i) => task(`t${String(i)}`, `задача ${String(i)}`, 100 + i)));
    await syncOnce(a, fresh(), srv.transport);
    const r = await syncOnce(b, fresh(), srv.transport);
    expect(r.pulled).toBe(5);
    expect(await b.tasks.count()).toBe(5);
  });

  it('настройки и журнал напоминаний не синхронизируются', async () => {
    await a.settings.put({ id: 'settings', updatedAt: 999 } as never);
    await a.reminderLogs.put({ id: 'r1', updatedAt: 999 } as never);
    expect(await collectChanges(a, 0)).toEqual([]);
  });

  it('мусор с сервера игнорируется', async () => {
    const n = await applyRemote(b, [
      { t: 'settings', id: 'settings', u: 1, d: '{}' },
      { t: 'tasks', id: 'x', u: 1, d: 'not json' },
      { t: 'tasks', id: 'x', u: 1, d: JSON.stringify({ id: 'другой', updatedAt: 1 }) },
    ]);
    expect(n).toBe(0);
  });
});
