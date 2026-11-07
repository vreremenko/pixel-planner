import { describe, expect, it } from 'vitest';
import { handle, sendDue, type Deps } from './core.ts';
import { smtpHost } from './mail.ts';
import type { Button } from './telegram.ts';
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

  it('таблицы тренировок, питания и финансов принимаются и отдаются, неизвестные — нет', async () => {
    const d = mk();
    const t = await register(d, 'a@b.ru');
    const gym = (tbl: string, id: string) => ({ t: tbl, id, u: 1, d: JSON.stringify({ id, updatedAt: 1 }) });
    await handle(req('PUT', 'sync', { token: t, body: { records: [gym('gym_workouts', 'w'), gym('gym_sets', 's'), gym('gym_programs', 'p'), gym('gym_exercises', 'e'), gym('gym_prefs', 'prefs'), gym('food_entries', 'f'), gym('fin_tx', 'm'), gym('gym_unknown', 'z')] } }), d);
    expect((await pull(d, t)).records.map((r) => r.id).sort()).toEqual(['e', 'f', 'm', 'p', 'prefs', 's', 'w']);
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

  it('расписание, присланное одним устройством, получают все устройства аккаунта, но не чужие', async () => {
    const sent: string[] = [];
    const d = mk({ send: (_e, to, data) => (sent.push(`${to.endpoint}:${(data as { key: string }).key}`), Promise.resolve({ status: 201, detail: '' })) });
    const token = await register(d, 'a@b.ru');
    const other = await register(d, 'b@b.ru');
    const PHONE = '22222222-2222-4222-8222-222222222222';
    const THEIRS = '33333333-3333-4333-8333-333333333333';
    const dev = (host: string) => ({ subscription: { endpoint: `https://${host}/x`, keys: { p256dh: 'k', auth: 'a' } } });
    await handle(req('PUT', `devices/${DEVICE}`, { token, body: dev('computer.test') }), d);
    await handle(req('PUT', `devices/${PHONE}`, { token, body: dev('phone.test') }), d);
    await handle(req('PUT', `devices/${THEIRS}`, { token: other, body: dev('theirs.test') }), d);
    // Расписание присылает компьютер, телефон приложение не открывал
    const res = await handle(req('PUT', 'schedule', { token, body: { deviceId: DEVICE, items: [item('a', 900_000)] } }), d);
    expect(res.body).toContain('"count":1');
    expect(res.body).toContain('"known":true');
    expect(await sendDue(d)).toBe(2);
    expect(sent.sort()).toEqual(['https://computer.test/x:a', 'https://phone.test/x:a']);
    expect((await handle(req('PUT', 'schedule', { token: other, body: { deviceId: DEVICE, items: [] } }), d)).body).toContain('"known":false');
    expect((await handle(req('PUT', 'schedule', { body: { items: [] } }), d)).status).toBe(401);
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

describe('поиск продуктов', () => {
  const hits = [{ code: '46', product_name: 'Кефир' }];
  const ok = () => Promise.resolve(new Response(JSON.stringify({ hits, page: 1 })));

  it('отдаёт найденное и повторный запрос берёт из кэша', async () => {
    const urls: string[] = [];
    const d = mk({
      offFetch: (u) => {
        urls.push(u as string);
        return ok();
      },
    });
    const first = await handle(req('GET', 'food/search', { query: { q: 'Кефир' } }), d);
    expect(first.status).toBe(200);
    expect(json(first)).toEqual({ products: hits });
    expect((await handle(req('GET', 'food/search', { query: { q: ' кефир ' } }), d)).body).toBe(first.body);
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0] ?? '').searchParams.get('q')).toBe('кефир');
  });

  it('убирает синтаксис запросов и отклоняет пустой запрос', async () => {
    const urls: string[] = [];
    const d = mk({
      offFetch: (u) => {
        urls.push(u as string);
        return ok();
      },
    });
    await handle(req('GET', 'food/search', { query: { q: 'brands:"кефир" 2,5%' } }), d);
    expect(new URL(urls[0] ?? '').searchParams.get('q')).toBe('brands кефир 2,5%');
    expect((await handle(req('GET', 'food/search', { query: { q: '"' } }), d)).status).toBe(400);
    expect(urls).toHaveLength(1);
  });

  it('сбой сервиса не кэширует, частые запросы с одного адреса ограничивает', async () => {
    const down = mk({ offFetch: () => Promise.resolve(new Response('', { status: 503 })) });
    expect((await handle(req('GET', 'food/search', { query: { q: 'творог' } }), down)).status).toBe(502);
    expect(down.offCache?.size).toBe(0);

    const d = mk({ offFetch: ok });
    for (let i = 0; i < 30; i++) expect((await handle(req('GET', 'food/search', { query: { q: `еда ${String(i)}` }, ip: '1.1.1.1' }), d)).status).toBe(200);
    expect((await handle(req('GET', 'food/search', { query: { q: 'ещё еда' }, ip: '1.1.1.1' }), d)).status).toBe(429);
    expect((await handle(req('GET', 'food/search', { query: { q: 'ещё еда' }, ip: '2.2.2.2' }), d)).status).toBe(200);
  });
});

describe('админка', () => {
  const env = { ALLOWED_ORIGINS: 'https://site.test', ADMIN_EMAILS: ' Boss@Site.ru , x@y.ru' };
  const stats = (d: Deps, token?: string) => handle(req('GET', 'admin/stats', token ? { token } : {}), d);
  const food = (id: string, u: number, extra: object = {}) => ({ t: 'food_entries', id, u, d: JSON.stringify({ id, updatedAt: u, name: 'Секретная еда', ...extra }) });

  it('пускает только админа: без входа 401, обычному пользователю 403', async () => {
    const d = mk({ env });
    const user = await register(d, 'a@b.ru');
    const boss = await register(d, 'boss@site.ru');
    expect((await stats(d)).status).toBe(401);
    expect((await stats(d, user)).status).toBe(403);
    expect((await stats(d, boss)).status).toBe(200);
  });

  it('без настройки админов нет ни у кого', async () => {
    const d = mk();
    expect((await stats(d, await register(d, 'boss@site.ru'))).status).toBe(403);
  });

  it('признак админа приходит только админу', async () => {
    const d = mk({ env });
    const user = await register(d, 'a@b.ru');
    const boss = await register(d, 'boss@site.ru');
    expect(json(await handle(req('GET', 'auth/me', { token: user }), d)).user).not.toHaveProperty('admin');
    expect((json(await handle(req('GET', 'auth/me', { token: boss }), d)).user as { admin?: boolean }).admin).toBe(true);
  });

  it('считает активность по дням и возвращение на следующей неделе', async () => {
    let now = 1_800_000_000_000;
    const d = mk({ env, now: () => now });
    const user = await register(d, 'a@b.ru');
    const boss = await register(d, 'boss@site.ru');
    await handle(req('GET', 'auth/me', { token: user }), d);
    await handle(req('GET', 'auth/me', { token: user }), d);
    now += 8 * 86_400_000;
    const s = json(await stats(d, boss)) as { active: { day: number; week: number; month: number }; returned: { previous: number; back: number }; days: { users: number }[]; list: { email: string; activeDays: number }[] };
    expect(s.active).toEqual({ day: 1, week: 1, month: 2 });
    expect(s.returned).toEqual({ previous: 2, back: 1 });
    expect(s.days).toHaveLength(7);
    expect(s.list.find((u) => u.email === 'a@b.ru')?.activeDays).toBe(1);
  });

  it('считает записи по разделам без удалённых, настроек и содержимого', async () => {
    const d = mk({ env, now: () => 1_000_000_000 });
    const boss = await register(d, 'boss@site.ru');
    const records = [food('a', 999_999_000), food('b', 1000), food('c', 999_999_000, { deletedAt: 5 }), { t: 'food_prefs', id: 'p', u: 999_999_000, d: '{"id":"p"}' }];
    await handle(req('PUT', 'sync', { token: boss, body: { records } }), d);
    const res = await stats(d, boss);
    const s = json(res) as { modules: { name: string; records: number; users: number; active: number }[]; list: { records: Record<string, number> }[] };
    expect(s.modules).toEqual([{ name: 'Питание', records: 2, users: 1, active: 1 }]);
    expect(s.list[0]?.records).toEqual({ Питание: 2 });
    expect(res.body).not.toContain('Секретная');
  });

  it('показывает версию приложения и не принимает мусор вместо неё', async () => {
    const d = mk({ env });
    const boss = await register(d, 'boss@site.ru');
    const version = async () => (json(await stats(d, boss)) as { list: { version: string | null }[] }).list[0]?.version;
    expect(await version()).toBeNull();
    await handle(req('GET', 'auth/me', { token: boss, query: { v: '<script>' } }), d);
    expect(await version()).toBeNull();
    await handle(req('GET', 'auth/me', { token: boss, query: { v: '0.22.0' } }), d);
    expect(await version()).toBe('0.22.0');
  });

  it('удаление аккаунта стирает и его активность', async () => {
    const d = mk({ env });
    const user = await register(d, 'a@b.ru');
    const boss = await register(d, 'boss@site.ru');
    await handle(req('DELETE', 'auth/account', { token: user, body: { password: PASSWORD } }), d);
    const s = json(await stats(d, boss)) as { users: { total: number }; active: { day: number } };
    expect(s.users.total).toBe(1);
    expect(s.active.day).toBe(1);
  });
});

describe('письма с кодами', () => {
  const NEW = 'новый пароль из письма';
  let now = 1_000_000;
  const setup = () => {
    now = 1_000_000;
    const mails: { to: string; text: string }[] = [];
    const d = mk({ now: () => now, sendMail: (to, _subject, text) => {
      mails.push({ to, text });
      return Promise.resolve();
    } });
    const lastCode = () => /: (\d{6})/.exec(mails.at(-1)?.text ?? '')?.[1] ?? '';
    return { d, mails, lastCode };
  };
  const post = (d: Deps, path: string, body: unknown, token?: string) => handle(req('POST', path, { body, ...(token ? { token } : {}) }), d);
  const me = async (d: Deps, token: string) => json(await handle(req('GET', 'auth/me', { token }), d)).user as { emailVerified: boolean };

  it('регистрация присылает код, он подтверждает почту', async () => {
    const { d, mails, lastCode } = setup();
    const token = await register(d, 'a@b.ru');
    expect(mails.map((m) => m.to)).toEqual(['a@b.ru']);
    expect((await me(d, token)).emailVerified).toBe(false);
    expect((await post(d, 'auth/verify', { code: '000000x' }, token)).status).toBe(400);
    expect((await post(d, 'auth/verify', { code: ` ${lastCode()} ` }, token)).status).toBe(200);
    expect((await me(d, token)).emailVerified).toBe(true);
    expect((await post(d, 'auth/verify', { code: lastCode() }, token)).status).toBe(400);
  });

  it('повторная отправка не чаще раза в минуту', async () => {
    const { d, mails } = setup();
    const token = await register(d, 'a@b.ru');
    expect(json(await post(d, 'auth/verify/send', {}, token)).error).toBe('code_cooldown');
    now += 61_000;
    expect((await post(d, 'auth/verify/send', {}, token)).status).toBe(200);
    expect(mails).toHaveLength(2);
  });

  it('код сгорает после пяти ошибок и через 15 минут', async () => {
    const { d, lastCode } = setup();
    const token = await register(d, 'a@b.ru');
    const good = lastCode();
    const wrong = good === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await post(d, 'auth/verify', { code: wrong }, token);
    expect((await post(d, 'auth/verify', { code: good }, token)).status).toBe(400);
    now += 61_000;
    await post(d, 'auth/verify/send', {}, token);
    now += 16 * 60_000;
    expect((await post(d, 'auth/verify', { code: lastCode() }, token)).status).toBe(400);
  });

  it('сброс пароля: меняет пароль, подтверждает почту и закрывает все сессии', async () => {
    const { d, lastCode } = setup();
    const token = await register(d, 'a@b.ru');
    now += 61_000;
    expect((await post(d, 'auth/reset/request', { email: 'A@b.ru' })).status).toBe(200);
    expect((await post(d, 'auth/reset', { email: 'a@b.ru', code: lastCode(), newPassword: 'коротко' })).status).toBe(400);
    expect((await post(d, 'auth/reset', { email: 'a@b.ru', code: lastCode(), newPassword: NEW })).status).toBe(200);
    expect((await handle(req('GET', 'auth/me', { token }), d)).status).toBe(401);
    expect((await post(d, 'auth/login', { email: 'a@b.ru', password: PASSWORD })).status).toBe(401);
    const login = await post(d, 'auth/login', { email: 'a@b.ru', password: NEW });
    expect((json(login).user as { emailVerified: boolean }).emailVerified).toBe(true);
    expect((await post(d, 'auth/reset', { email: 'a@b.ru', code: lastCode(), newPassword: NEW })).status).toBe(400);
  });

  it('код подтверждения не подходит для сброса, а чужая почта отвечает так же', async () => {
    const { d, mails, lastCode } = setup();
    await register(d, 'a@b.ru');
    expect((await post(d, 'auth/reset', { email: 'a@b.ru', code: lastCode(), newPassword: NEW })).status).toBe(400);
    const unknown = await post(d, 'auth/reset/request', { email: 'нет@такой.ru' });
    expect(unknown.status).toBe(200);
    expect(json(unknown)).toEqual({ ok: true });
    expect(mails).toHaveLength(1);
    expect((await post(d, 'auth/reset', { email: 'нет@такой.ru', code: '123456', newPassword: NEW })).status).toBe(400);
  });

  it('без настроек почты регистрация работает, а отправка кодов честно отказывает', async () => {
    const d = mk();
    const token = await register(d, 'a@b.ru');
    expect(json(await post(d, 'auth/verify/send', {}, token)).error).toBe('mail_unavailable');
    expect(json(await post(d, 'auth/reset/request', { email: 'a@b.ru' })).error).toBe('mail_unavailable');
  });
});

describe('сервер почты', () => {
  it('выбирается по адресу ящика', () => {
    expect(smtpHost('app@yandex.ru')).toBe('smtp.yandex.ru');
    expect(smtpHost('app@ya.ru')).toBe('smtp.yandex.ru');
    expect(smtpHost('app@mail.ru')).toBe('smtp.mail.ru');
  });
});

describe('Telegram', () => {
  const KEY = 'ключ посредника';
  const TG = 42;
  const setup = () => {
    const sent: { text: string; button?: Button }[] = [];
    const d = mk({
      env: { TELEGRAM_BOT_NAME: 'bot', TELEGRAM_RELAY_KEY: KEY },
      telegram: {
        send: (_id, text, button) => {
          sent.push({ text, ...(button ? { button } : {}) });
          return Promise.resolve();
        },
        answer: () => Promise.resolve(),
      },
    });
    return { d, sent };
  };
  const update = (d: Deps, body: unknown, key = KEY) => handle({ ...req('POST', 'telegram/update', { body }), headers: { 'x-relay-key': key } }, d);
  const text = (d: Deps, value: string, from = TG) => update(d, { message: { text: value, chat: { id: from, type: 'private' }, from: { id: from } } });
  const press = (d: Deps, data: string, from = TG) => update(d, { callback_query: { id: 'c', data, from: { id: from }, message: { chat: { id: from } } } });
  const post = async (d: Deps, path: string, body: unknown = {}, token?: string) => json(await handle(req('POST', path, { body, ...(token ? { token } : {}) }), d));
  const link = async (d: Deps, token: string, from = TG) => {
    const { code } = (await post(d, 'auth/telegram/link', {}, token)) as { code: string };
    await text(d, `/start link_${code}`, from);
    await press(d, `ok:${code}`, from);
    return code;
  };

  it('обновление принимается только с ключом посредника', async () => {
    const { d, sent } = setup();
    expect((await update(d, {}, 'чужой')).status).toBe(403);
    expect((await text(d, 'привет')).status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('привязка: бот спрашивает подтверждение и только потом привязывает', async () => {
    const { d, sent } = setup();
    const token = await register(d, 'a@b.ru');
    const { code, url } = (await post(d, 'auth/telegram/link', {}, token)) as { code: string; url: string };
    expect(url).toBe(`https://t.me/bot?start=link_${code}`);
    await text(d, `/start link_${code}`);
    expect(sent.at(-1)?.button?.data).toBe(`ok:${code}`);
    expect((await post(d, 'auth/telegram/check', { code })).status).toBe('pending');
    await press(d, `ok:${code}`);
    const done = await post(d, 'auth/telegram/check', { code });
    expect(done.status).toBe('linked');
    expect(done).not.toHaveProperty('token');
    expect((done.user as { telegram: boolean }).telegram).toBe(true);
  });

  it('вход: сессию получает приложение, но только после кнопки в боте', async () => {
    const { d } = setup();
    await link(d, await register(d, 'a@b.ru'));
    const { code } = (await post(d, 'auth/telegram/start')) as { code: string };
    await text(d, `/start login_${code}`);
    expect(await post(d, 'auth/telegram/check', { code })).toEqual({ status: 'pending' });
    await press(d, `ok:${code}`);
    const done = await post(d, 'auth/telegram/check', { code });
    expect(done.status).toBe('confirmed');
    expect((await handle(req('GET', 'auth/me', { token: done.token as string }), d)).status).toBe(200);
    expect((await post(d, 'auth/telegram/check', { code })).error).toBe('bad_code');
  });

  it('вход с непривязанным Telegram честно отказывает', async () => {
    const { d } = setup();
    const { code } = (await post(d, 'auth/telegram/start')) as { code: string };
    await text(d, `/start login_${code}`);
    expect((await post(d, 'auth/telegram/check', { code })).error).toBe('telegram_not_linked');
  });

  it('чужой Telegram не подтвердит вход, а занятый нельзя привязать ко второму аккаунту', async () => {
    const { d, sent } = setup();
    await link(d, await register(d, 'a@b.ru'));
    const { code } = (await post(d, 'auth/telegram/start')) as { code: string };
    await press(d, `ok:${code}`, 777);
    expect(await post(d, 'auth/telegram/check', { code })).toEqual({ status: 'pending' });
    await link(d, await register(d, 'c@d.ru'));
    expect(sent.some((m) => m.text.includes('уже привязан'))).toBe(true);
  });

  it('просроченная ссылка не работает, отвязка закрывает вход', async () => {
    let now = 1_000_000;
    const { d } = setup();
    const ticking = { ...d, now: () => now };
    const token = await register(ticking, 'a@b.ru');
    await link(ticking, token);
    const { code } = (await post(ticking, 'auth/telegram/start')) as { code: string };
    now += 11 * 60_000;
    await press(ticking, `ok:${code}`);
    expect((await post(ticking, 'auth/telegram/check', { code })).error).toBe('bad_code');
    await handle(req('DELETE', 'auth/telegram', { token }), ticking);
    const next = (await post(ticking, 'auth/telegram/start')) as { code: string };
    await text(ticking, `/start login_${next.code}`);
    expect((await post(ticking, 'auth/telegram/check', { code: next.code })).error).toBe('telegram_not_linked');
  });

  it('напоминания в Telegram: включаются только с привязкой и уходят в чат', async () => {
    const { d, sent } = setup();
    const token = await register(d, 'a@b.ru');
    expect((await post(d, 'auth/telegram/reminders', { on: true }, token)).error).toBe('telegram_not_linked');
    await link(d, token);
    await post(d, 'auth/telegram/reminders', { on: true }, token);
    await post(d, 'auth/telegram/reminders', { on: true }, token);
    expect(((await handle(req('GET', 'auth/me', { token }), d)).body)).toContain('"telegramReminders":true');
    const item = { key: 'k', fireAt: 999_000, kind: 'task', ref: 'r', date: '2026-01-01', title: 'Позвонить', body: 'в 19:00' };
    await handle(req('PUT', 'schedule', { token, body: { items: [item] } }), d);
    expect(await sendDue(d)).toBe(1);
    expect(sent.at(-1)?.text).toBe('⏰ Позвонить\nв 19:00');
    await handle(req('DELETE', 'auth/telegram', { token }), d);
    expect(((await handle(req('GET', 'auth/me', { token }), d)).body)).toContain('"telegramReminders":false');
  });

  it('отзыв уходит админу в Telegram и ограничен по частоте', async () => {
    const { d, sent } = setup();
    const admin = { ...d, env: { ...d.env, ADMIN_EMAILS: 'boss@site.ru' } };
    await link(admin, await register(admin, 'boss@site.ru'));
    const token = await register(admin, 'a@b.ru');
    expect((await post(admin, 'feedback', { text: '  ' }, token)).error).toBe('bad_text');
    expect(await post(admin, 'feedback', { text: 'Добавьте тёмную тему', version: '0.26.0' }, token)).toEqual({ ok: true });
    expect(sent.at(-1)?.text).toBe('Отзыв из PIXEL PLANNER\nОт: a@b.ru\nВерсия: 0.26.0\n\nДобавьте тёмную тему');
    for (let i = 0; i < 4; i++) await post(admin, 'feedback', { text: 'ещё' }, token);
    expect((await post(admin, 'feedback', { text: 'шестой' }, token)).error).toBe('too_many_attempts');
    expect((await post(mk(), 'feedback', { text: 'x' })).error).toBe('unauthorized');
  });

  it('без настроек бота вход честно недоступен', async () => {
    expect((await post(mk(), 'auth/telegram/start')).error).toBe('telegram_unavailable');
  });
});
