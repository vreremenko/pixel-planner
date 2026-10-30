import { describe, expect, it } from 'vitest';
import { handle } from './core.ts';
import { json, mk, register, req } from './test-helpers.ts';
import { SqliteStore } from './sqlite-store.ts';
import type { ScheduleItem } from './types.ts';

const DEVICE = '11111111-1111-4111-8111-111111111111';
const rec = (id: string, u: number, pad = '') => ({ t: 'tasks', id, u, d: JSON.stringify({ id, updatedAt: u, pad }) });
const item = (key: string, fireAt: number): ScheduleItem => ({ key, fireAt, kind: 'task', ref: 'r', date: '2026-01-01', title: 'Позвонить', body: 'в 19:00' });

describe('SqliteStore: синхронизация и напоминания', () => {
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

  it('напоминания: наступившие, отправленное не повторяется, удаление устройства', async () => {
    const s = new SqliteStore(':memory:');
    await s.deviceUpsert({ id: DEVICE, userId: 'u1', endpoint: 'https://push.test/x', p256dh: 'k', auth: 'a', now: 1 });
    expect(await s.deviceOwner(DEVICE)).toBe('u1');
    await s.scheduleReplace(DEVICE, [item('a', 900), item('b', 2000)], 1000);
    expect((await s.dueReminders(1000, 200)).map((d) => d.key)).toEqual(['a']);
    await s.markSent([{ deviceId: DEVICE, key: 'a' }]);
    expect(await s.dueReminders(1000, 200)).toEqual([]);
    await s.scheduleReplace(DEVICE, [item('a', 900), item('c', 950)], 1001);
    expect((await s.dueReminders(1001, 200)).map((d) => d.key)).toEqual(['c']);
    await s.deviceDelete(DEVICE);
    expect(await s.deviceOwner(DEVICE)).toBeNull();
    s.close();
  });
});

describe('SqliteStore: аккаунты', () => {
  it('пользователь: уникальная почта, поиск, смена пароля', async () => {
    const s = new SqliteStore(':memory:');
    expect(await s.userCreate({ id: 'u1', email: 'a@b.ru', passHash: 'h1', now: 1 })).toBe(true);
    expect(await s.userCreate({ id: 'u2', email: 'a@b.ru', passHash: 'h2', now: 2 })).toBe(false);
    expect((await s.userByEmail('a@b.ru'))?.id).toBe('u1');
    await s.userSetPassword('u1', 'h3');
    expect((await s.userById('u1'))?.passHash).toBe('h3');
    expect(await s.userByEmail('нет@нет.ru')).toBeNull();
    s.close();
  });

  it('сессии: проверка, простой дольше срока, выход, закрытие остальных', async () => {
    const s = new SqliteStore(':memory:');
    await s.sessionCreate({ tokenHash: 't1', userId: 'u1', device: '', now: 1000 });
    await s.sessionCreate({ tokenHash: 't2', userId: 'u1', device: '', now: 1000 });
    expect(await s.sessionUser('t1', 2000, 10_000)).toBe('u1');
    expect(await s.sessionUser('t1', 50_000, 10_000)).toBeNull();
    await s.sessionsDeleteOthers('u1', 't2');
    expect(await s.sessionUser('t1', 2000, 10_000)).toBeNull();
    expect(await s.sessionUser('t2', 2000, 10_000)).toBe('u1');
    await s.sessionDelete('t2');
    expect(await s.sessionUser('t2', 2000, 10_000)).toBeNull();
    s.close();
  });

  it('удаление пользователя стирает его данные, устройства и сессии, чужие не трогает', async () => {
    const s = new SqliteStore(':memory:');
    await s.userCreate({ id: 'u1', email: 'a@b.ru', passHash: 'h', now: 1 });
    await s.userCreate({ id: 'u2', email: 'b@b.ru', passHash: 'h', now: 1 });
    await s.syncPush('u1', [rec('a', 1)]);
    await s.syncPush('u2', [rec('b', 1)]);
    await s.deviceUpsert({ id: DEVICE, userId: 'u1', endpoint: 'https://push.test/x', p256dh: 'k', auth: 'a', now: 1 });
    await s.scheduleReplace(DEVICE, [item('a', 900)], 1000);
    await s.sessionCreate({ tokenHash: 't1', userId: 'u1', device: '', now: 1 });
    await s.userDelete('u1');
    expect(await s.userById('u1')).toBeNull();
    expect(await s.syncPull('u1', 0, 10)).toEqual([]);
    expect(await s.deviceOwner(DEVICE)).toBeNull();
    expect(await s.dueReminders(9999, 10)).toEqual([]);
    expect(await s.sessionUser('t1', 2, 10_000)).toBeNull();
    expect((await s.syncPull('u2', 0, 10)).length).toBe(1);
    s.close();
  });

  it('те же сценарии через HTTP-слой на настоящей базе: регистрация, вход, синхронизация', async () => {
    const store = new SqliteStore(':memory:');
    const d = mk({}, store);
    const token = await register(d, 'a@b.ru');
    await handle(req('PUT', 'sync', { token, body: { records: [rec('x', 5)] } }), d);
    const second = json(await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: 'correct horse battery' } }), d)).token as string;
    const got = json(await handle(req('GET', 'sync', { token: second, query: { after: '0' } }), d)) as { records: { id: string }[] };
    expect(got.records.map((r) => r.id)).toEqual(['x']);
    expect((await handle(req('POST', 'auth/register', { body: { email: 'A@B.ru', password: 'correct horse battery' } }), d)).status).toBe(409);
    store.close();
  });
});
