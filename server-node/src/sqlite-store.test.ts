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
    expect(await s.syncCount('sp')).toBe(3);
    expect(await s.syncCount('other')).toBe(0);
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

describe('SqliteStore: почта', () => {
  it('подтверждение, коды и закрытие всех сессий', async () => {
    const s = new SqliteStore(':memory:');
    await s.userCreate({ id: 'u', email: 'a@b.ru', passHash: 'h', now: 1 });
    expect((await s.userById('u'))?.emailVerified).toBe(false);
    await s.userSetVerified('u', 5);
    expect((await s.userByEmail('a@b.ru'))?.emailVerified).toBe(true);
    expect((await s.adminUsers())[0]?.emailVerified).toBe(true);
    const code = { userId: 'u', kind: 'reset' as const, codeHash: 'x', expiresAt: 9, sentAt: 1, attempts: 0 };
    await s.codeSet(code);
    await s.codeAttempt('u', 'reset');
    expect(await s.codeGet('u', 'reset')).toEqual({ ...code, attempts: 1 });
    expect(await s.codeGet('u', 'verify')).toBeNull();
    await s.codeSet({ ...code, codeHash: 'y' });
    expect((await s.codeGet('u', 'reset'))?.attempts).toBe(0);
    await s.codeDelete('u', 'reset');
    expect(await s.codeGet('u', 'reset')).toBeNull();
    await s.sessionCreate({ tokenHash: 'a', userId: 'u', device: '', now: 1 });
    await s.sessionCreate({ tokenHash: 'b', userId: 'u', device: '', now: 1 });
    await s.sessionsDeleteAll('u');
    expect(await s.sessionUser('a', 2, 100)).toBeNull();
    await s.codeSet(code);
    await s.userDelete('u');
    expect(await s.codeGet('u', 'reset')).toBeNull();
  });
});

describe('SqliteStore: Telegram', () => {
  it('привязка, отвязка, коды и удаление аккаунта', async () => {
    const s = new SqliteStore(':memory:');
    await s.userCreate({ id: 'u', email: 'a@b.ru', passHash: 'h', now: 1 });
    await s.userCreate({ id: 'v', email: 'c@d.ru', passHash: 'h', now: 1 });
    await s.userSetTelegram('u', '42');
    expect((await s.userByTelegram('42'))?.id).toBe('u');
    expect((await s.adminUsers()).find((x) => x.id === 'u')?.telegram).toBe(true);
    expect(() => s.userSetTelegram('v', '42')).toThrow();
    await s.userSetTelegram('u', null);
    expect(await s.userByTelegram('42')).toBeNull();
    const code = { codeHash: 'x', kind: 'link' as const, userId: 'u', status: 'pending' as const, expiresAt: 9 };
    await s.tgCodeSet(code);
    expect(await s.tgCodeGet('x')).toEqual(code);
    await s.userDelete('u');
    expect(await s.tgCodeGet('x')).toBeNull();
  });
});

describe('SqliteStore: админка', () => {
  it('считает активность, сессии и записи без удалённых', async () => {
    const s = new SqliteStore(':memory:');
    await s.userCreate({ id: 'u', email: 'a@b.ru', passHash: 'h', now: 1 });
    await s.sessionCreate({ tokenHash: 't', userId: 'u', device: '', now: 500 });
    await s.activityTouch('u', '2026-11-06');
    await s.activityTouch('u', '2026-11-06');
    await s.activityTouch('u', '2026-11-01');
    await s.syncPush('u', [rec('a', 100), rec('b', 5), { t: 'tasks', id: 'c', u: 100, d: '{"deletedAt":1}' }]);
    expect(await s.activitySince('2026-11-02')).toEqual([{ userId: 'u', day: '2026-11-06' }]);
    expect(await s.adminUsers()).toEqual([{ id: 'u', email: 'a@b.ru', createdAt: 1, emailVerified: false, telegram: false, lastSeen: 500, sessions: 1, pushDevices: 0, appVersion: null }]);
    expect(await s.adminRecords(50)).toEqual([{ userId: 'u', table: 'tasks', records: 2, recent: 1 }]);
    await s.sessionSetVersion('t', '0.22.0');
    expect((await s.adminUsers())[0]?.appVersion).toBe('0.22.0');
    await s.userDelete('u');
    expect(await s.activitySince('2026-01-01')).toEqual([]);
  });
});
