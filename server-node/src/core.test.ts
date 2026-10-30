import { describe, expect, it } from 'vitest';
import { handle, sendDue, type Deps } from './core.ts';
import { MemoryStore } from './memory-store.ts';
import { json, mk, register, req } from './test-helpers.ts';

const DEVICE = '11111111-1111-4111-8111-111111111111';
const PASSWORD = 'correct horse battery';

const rec = (id: string, u: number, pad = '') => ({ t: 'tasks', id, u, d: JSON.stringify({ id, updatedAt: u, pad }) });
const pull = async (d: Deps, token: string, after = 0) =>
  json(await handle(req('GET', 'sync', { token, query: { after: String(after) } }), d)) as { records: { id: string; u: number }[]; cursor: number; more: boolean };

describe('аккаунты', () => {
  it('регистрация: почта нормализуется, пароль проверяется, дубликат отклоняется', async () => {
    const d = mk();
    const ok = await handle(req('POST', 'auth/register', { body: { email: '  Ivan@Example.COM ', password: PASSWORD } }), d);
    expect(ok.status).toBe(201);
    expect((json(ok).user as { email: string }).email).toBe('ivan@example.com');
    expect((await handle(req('POST', 'auth/register', { body: { email: 'ivan@example.com', password: PASSWORD } }), d)).status).toBe(409);
    expect(json(await handle(req('POST', 'auth/register', { body: { email: 'не-почта', password: PASSWORD } }), d)).error).toBe('invalid_email');
    expect(json(await handle(req('POST', 'auth/register', { body: { email: 'a@b.ru', password: 'коротко' } }), d)).error).toBe('weak_password');
  });

  it('вход: верный пароль даёт токен, неверный и неизвестная почта — одинаковая ошибка', async () => {
    const d = mk();
    await register(d, 'a@b.ru');
    const good = await handle(req('POST', 'auth/login', { body: { email: 'A@b.ru', password: PASSWORD } }), d);
    expect(good.status).toBe(200);
    expect(typeof json(good).token).toBe('string');
    const wrong = await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: 'неверный пароль' } }), d);
    const nobody = await handle(req('POST', 'auth/login', { body: { email: 'нет@такой.ru', password: PASSWORD } }), d);
    expect([wrong.status, nobody.status]).toEqual([401, 401]);
    expect(wrong.body).toBe(nobody.body);
  });

  it('после нескольких неудачных попыток вход временно закрывается', async () => {
    const d = mk();
    await register(d, 'a@b.ru');
    for (let i = 0; i < 8; i++) await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: 'неверный пароль' } }), d);
    const blocked = await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: PASSWORD } }), d);
    expect(blocked.status).toBe(429);
  });

  it('регистраций с одного адреса не больше десяти в час', async () => {
    const d = mk();
    for (let i = 0; i < 10; i++) await handle(req('POST', 'auth/register', { body: { email: `u${String(i)}@b.ru`, password: PASSWORD }, ip: '1.2.3.4' }), d);
    expect((await handle(req('POST', 'auth/register', { body: { email: 'extra@b.ru', password: PASSWORD }, ip: '1.2.3.4' }), d)).status).toBe(429);
    expect((await handle(req('POST', 'auth/register', { body: { email: 'other@b.ru', password: PASSWORD }, ip: '5.6.7.8' }), d)).status).toBe(201);
  });

  it('me и выход: после выхода токен не работает', async () => {
    const d = mk();
    const token = await register(d, 'a@b.ru');
    expect((await handle(req('GET', 'auth/me', { token }), d)).status).toBe(200);
    expect((await handle(req('POST', 'auth/logout', { token }), d)).status).toBe(200);
    expect((await handle(req('GET', 'auth/me', { token }), d)).status).toBe(401);
  });

  it('смена пароля закрывает остальные сессии, старый пароль больше не подходит', async () => {
    const d = mk();
    const t1 = await register(d, 'a@b.ru');
    const t2 = json(await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: PASSWORD } }), d)).token as string;
    expect((await handle(req('POST', 'auth/password', { token: t1, body: { oldPassword: 'не тот пароль', newPassword: 'новый пароль 123' } }), d)).status).toBe(401);
    expect((await handle(req('POST', 'auth/password', { token: t1, body: { oldPassword: PASSWORD, newPassword: 'новый пароль 123' } }), d)).status).toBe(200);
    expect((await handle(req('GET', 'auth/me', { token: t1 }), d)).status).toBe(200);
    expect((await handle(req('GET', 'auth/me', { token: t2 }), d)).status).toBe(401);
    expect((await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: PASSWORD } }), d)).status).toBe(401);
    expect((await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: 'новый пароль 123' } }), d)).status).toBe(200);
  });

  it('удаление аккаунта стирает данные и закрывает вход', async () => {
    const d = mk();
    const token = await register(d, 'a@b.ru');
    await handle(req('PUT', 'sync', { token, body: { records: [rec('a', 1)] } }), d);
    expect((await handle(req('DELETE', 'auth/account', { token, body: { password: 'неверный пароль' } }), d)).status).toBe(401);
    expect((await handle(req('DELETE', 'auth/account', { token, body: { password: PASSWORD } }), d)).status).toBe(200);
    expect((await handle(req('GET', 'auth/me', { token }), d)).status).toBe(401);
    expect((await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: PASSWORD } }), d)).status).toBe(401);
    // Та же почта снова свободна, и данных у нового аккаунта нет
    const again = await register(d, 'a@b.ru');
    expect((await pull(d, again)).records).toEqual([]);
  });

  it('сессия, которой не пользовались больше года, перестаёт работать', async () => {
    let now = 1_000_000;
    const d = mk({ now: () => now });
    const token = await register(d, 'a@b.ru');
    now += 364 * 86_400_000;
    expect((await handle(req('GET', 'auth/me', { token }), d)).status).toBe(200);
    now += 366 * 86_400_000;
    expect((await handle(req('GET', 'auth/me', { token }), d)).status).toBe(401);
  });
});

describe('защита', () => {
  it('ответы не кэшируются и не разрешают угадывать тип', async () => {
    const d = mk();
    for (const res of [await handle(req('GET', 'config'), d), await handle(req('GET', 'sync'), d), await handle(req('POST', 'auth/login', { body: { email: 'нет@нет.ru', password: PASSWORD } }), d)]) {
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('пароль хранится только как хеш scrypt с солью; одинаковые пароли дают разные хеши', async () => {
    const store = new MemoryStore();
    const d = mk({}, store);
    await register(d, 'a@b.ru');
    await register(d, 'c@b.ru');
    const a = (await store.userByEmail('a@b.ru'))?.passHash ?? '';
    const c = (await store.userByEmail('c@b.ru'))?.passHash ?? '';
    expect(a).toMatch(/^scrypt\$65536\$8\$1\$/);
    expect(a).not.toContain(PASSWORD);
    expect(a).not.toBe(c);
  });

  it('токены на сервере хранятся только в виде хеша', async () => {
    const store = new MemoryStore();
    const d = mk({}, store);
    const token = await register(d, 'a@b.ru');
    expect(JSON.stringify([...(store as unknown as { sessions: Map<string, unknown> }).sessions.keys()])).not.toContain(token);
  });
});

describe('синхронизация', () => {
  it('без токена и с чужим токеном — 401', async () => {
    const d = mk();
    expect((await handle(req('GET', 'sync'), d)).status).toBe(401);
    expect((await handle(req('GET', 'sync', { token: 'короткий' }), d)).status).toBe(401);
    expect((await handle(req('GET', 'sync', { token: 'A'.repeat(43) }), d)).status).toBe(401);
  });

  it('побеждает запись с большим updatedAt, у разных пользователей данные раздельные', async () => {
    const d = mk();
    const a = await register(d, 'a@b.ru');
    const b = await register(d, 'b@b.ru');
    await handle(req('PUT', 'sync', { token: a, body: { records: [rec('x', 100), rec('y', 100), { t: 'settings', id: 's', u: 1, d: '{}' }] } }), d);
    await handle(req('PUT', 'sync', { token: a, body: { records: [rec('x', 50), rec('y', 200)] } }), d);
    expect((await pull(d, a)).records.map((r) => `${r.id}:${String(r.u)}`).sort()).toEqual(['x:100', 'y:200']);
    expect((await pull(d, b)).records).toEqual([]);
  });

  it('вошёл с другого устройства — видит те же данные', async () => {
    const d = mk();
    const phone = await register(d, 'a@b.ru');
    await handle(req('PUT', 'sync', { token: phone, body: { records: [rec('x', 1)] } }), d);
    const laptop = json(await handle(req('POST', 'auth/login', { body: { email: 'a@b.ru', password: PASSWORD } }), d)).token as string;
    expect((await pull(d, laptop)).records.map((r) => r.id)).toEqual(['x']);
  });

  it('большой ответ делится на пачки, курсор доводит до конца', async () => {
    const d = mk();
    const token = await register(d, 'a@b.ru');
    for (const part of ['a', 'b']) await handle(req('PUT', 'sync', { token, body: { records: Array.from({ length: 300 }, (_, i) => rec(`${part}${String(i)}`, i + 1, 'x'.repeat(1500))) } }), d);
    let cursor = 0;
    let got = 0;
    let pages = 0;
    for (;;) {
      const res = await handle(req('GET', 'sync', { token, query: { after: String(cursor) } }), d);
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

  it('удаление стирает данные аккаунта', async () => {
    const d = mk();
    const token = await register(d, 'a@b.ru');
    await handle(req('PUT', 'sync', { token, body: { records: [rec('a', 1)] } }), d);
    await handle(req('DELETE', 'sync', { token }), d);
    expect((await pull(d, token)).records).toEqual([]);
  });
});

describe('служебное', () => {
  it('config отдаёт ключ VAPID', async () => {
    const d = mk();
    expect(json(await handle(req('GET', 'config'), d))).toEqual({ vapidPublicKey: 'pub', push: true });
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

  it('без входа устройства не регистрируются', async () => {
    const d = mk();
    expect((await handle(req('PUT', `devices/${DEVICE}`, { body: sub }), d)).status).toBe(401);
  });

  it('устройство → расписание → рассылка наступивших, отправленное не повторяется', async () => {
    const sent: string[] = [];
    const d = mk({ send: (_e, _to, data) => (sent.push((data as { key: string }).key), Promise.resolve({ status: 201, detail: '' })) });
    const token = await register(d, 'a@b.ru');
    expect((await handle(req('PUT', `devices/${DEVICE}`, { token, body: sub }), d)).status).toBe(200);
    expect((await handle(req('PUT', `devices/${DEVICE}/schedule`, { token, body: { items: [item('a', 900_000), item('b', 2_000_000), { bad: 1 }] } }), d)).body).toContain('"count":2');
    expect(await sendDue(d)).toBe(1);
    expect(sent).toEqual(['a']);
    expect(await sendDue(d)).toBe(0);
  });

  it('чужое устройство не видно и не меняется', async () => {
    const d = mk();
    const owner = await register(d, 'a@b.ru');
    const other = await register(d, 'b@b.ru');
    await handle(req('PUT', `devices/${DEVICE}`, { token: owner, body: sub }), d);
    expect((await handle(req('PUT', `devices/${DEVICE}/schedule`, { token: other, body: { items: [] } }), d)).status).toBe(404);
    expect((await handle(req('PUT', `devices/${DEVICE}`, { token: other, body: sub }), d)).status).toBe(404);
    expect((await handle(req('PUT', `devices/${DEVICE}/schedule`, { token: owner, body: { items: [] } }), d)).status).toBe(200);
  });

  it('устройство, которое сервис забыл (410), удаляется', async () => {
    const d = mk({ send: () => Promise.resolve({ status: 410, detail: '' }) });
    const token = await register(d, 'a@b.ru');
    await handle(req('PUT', `devices/${DEVICE}`, { token, body: sub }), d);
    await handle(req('PUT', `devices/${DEVICE}/schedule`, { token, body: { items: [item('a', 900_000)] } }), d);
    await sendDue(d);
    expect((await handle(req('PUT', `devices/${DEVICE}/schedule`, { token, body: { items: [] } }), d)).status).toBe(404);
  });

  it('временная ошибка (503) — повтор в следующую минуту', async () => {
    let status = 503;
    const d = mk({ send: () => Promise.resolve({ status, detail: '' }) });
    const token = await register(d, 'a@b.ru');
    await handle(req('PUT', `devices/${DEVICE}`, { token, body: sub }), d);
    await handle(req('PUT', `devices/${DEVICE}/schedule`, { token, body: { items: [item('a', 900_000)] } }), d);
    expect(await sendDue(d)).toBe(0);
    status = 201;
    expect(await sendDue(d)).toBe(1);
  });

  it('«отложить» создаёт новое напоминание, неизвестное устройство — 404', async () => {
    const sent: string[] = [];
    const d = mk({ send: (_e, _to, data) => (sent.push((data as { key: string }).key), Promise.resolve({ status: 201, detail: '' })) });
    const token = await register(d, 'a@b.ru');
    expect((await handle(req('POST', `devices/${DEVICE}/snooze`, { token, body: item('a', 1) }), d)).status).toBe(404);
    await handle(req('PUT', `devices/${DEVICE}`, { token, body: sub }), d);
    expect((await handle(req('POST', `devices/${DEVICE}/snooze`, { token, body: item('a', 900_000) }), d)).status).toBe(200);
    await sendDue(d);
    expect(sent).toEqual(['a']);
  });

  it('удаление аккаунта убирает и устройства с напоминаниями', async () => {
    const sent: string[] = [];
    const d = mk({ send: (_e, _to, data) => (sent.push((data as { key: string }).key), Promise.resolve({ status: 201, detail: '' })) });
    const token = await register(d, 'a@b.ru');
    await handle(req('PUT', `devices/${DEVICE}`, { token, body: sub }), d);
    await handle(req('PUT', `devices/${DEVICE}/schedule`, { token, body: { items: [item('a', 900_000)] } }), d);
    await handle(req('DELETE', 'auth/account', { token, body: { password: PASSWORD } }), d);
    expect(await sendDue(d)).toBe(0);
    expect(sent).toEqual([]);
  });
});
