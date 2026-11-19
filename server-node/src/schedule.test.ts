import { describe, expect, it } from 'vitest';
import { toInstant } from '../../src/core/domain/dates.ts';
import { handle, sendDue } from './core.ts';
import { MemoryStore } from './memory-store.ts';
import { isTimeZone, refreshSchedule, todayIn, withTimeZone } from './schedule.ts';
import { json, mk, register, req } from './test-helpers.ts';

// 2026-11-19 20:30 UTC: в Москве ещё 19-е (23:30), в Екатеринбурге уже 20-е (01:30)
const NOW = Date.UTC(2026, 10, 19, 20, 30);
const DEVICE = '11111111-1111-4111-8111-111111111111';

async function setup(tz?: string) {
  const store = new MemoryStore();
  const d = mk({ now: () => NOW }, store);
  const session = await register(d, 'a@b.ru');
  const user = await store.userByEmail('a@b.ru');
  const userId = user?.id ?? '';
  await store.deviceUpsert({ id: DEVICE, userId, endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p', auth: 'a', now: NOW });
  const key = String(json(await handle(req('POST', 'auth/keys', { token: session, body: { name: 'Claude' } }), d)).key);
  if (tz) expect((await handle(req('PUT', 'schedule', { token: session, body: { items: [], tz } }), d)).status).toBe(200);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = json(await handle(req('POST', 'mcp', { token: key, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } }), d)) as { result: { content: { text: string }[]; isError?: boolean } };
    return r.result.content[0]?.text ?? '';
  };
  const due = async () => (await store.dueReminders(NOW + 30 * 86_400_000, 100)).map((r) => ({ key: r.key, fireAt: r.fireAt, title: r.title }));
  return { store, d, userId, call, due };
}

describe('сервер сам считает расписание', () => {
  it('пояс процесса меняется на время расчёта и возвращается', () => {
    const before = process.env.TZ;
    expect(withTimeZone('Europe/Moscow', () => toInstant('2026-11-20', '10:00').toISOString())).toBe('2026-11-20T07:00:00.000Z');
    expect(withTimeZone('Asia/Yekaterinburg', () => toInstant('2026-11-20', '10:00').toISOString())).toBe('2026-11-20T05:00:00.000Z');
    expect(process.env.TZ).toBe(before);
    expect(isTimeZone('Asia/Yekaterinburg')).toBe(true);
    expect(isTimeZone('Mars/Base')).toBe(false);
    expect(todayIn(NOW, 'Europe/Moscow')).toBe('2026-11-19');
    expect(todayIn(NOW, 'Asia/Yekaterinburg')).toBe('2026-11-20');
  });

  it('задача от нейросети сразу попадает в расписание устройства — по поясу пользователя', async () => {
    const { call, due } = await setup('Asia/Yekaterinburg');
    // «Сегодня» для нейросети — уже 20-е по Екатеринбургу
    expect(await call('add_task', { title: 'Врач', date: 'today', time: '10:00', reminders: [0, 60] })).toContain('на Пт, 20 ноября в 10:00, напомню за час и в начале');
    const list = await due();
    expect(list.filter((r) => r.title.includes('Врач')).map((r) => new Date(r.fireAt).toISOString()).sort()).toEqual(['2026-11-20T04:00:00.000Z', '2026-11-20T05:00:00.000Z']);
  });

  it('без пояса — по Москве; задача со временем по умолчанию напоминает в начале', async () => {
    const { call, due } = await setup();
    expect(await call('add_task', { title: 'Позвонить', date: '2026-11-21', time: '09:30' })).toContain('напомню в начале');
    expect((await due()).find((r) => r.title.includes('Позвонить'))?.fireAt).toBe(Date.UTC(2026, 10, 21, 6, 30));
    // Без времени напоминание не ставится
    expect(await call('add_task', { title: 'Книга', date: 'tomorrow', reminders: [60] })).toContain('передайте time');
  });

  it('продление: пересчёт без участия приложения', async () => {
    const { store, userId, call, due } = await setup('Europe/Moscow');
    await call('add_task', { title: 'Отчёт', date: '2026-11-25', time: '12:00' });
    const keys = (await due()).length;
    expect(await refreshSchedule(store, userId, NOW)).toBeGreaterThanOrEqual(1);
    expect((await due()).length).toBe(keys);
    // Пользователь без устройств — ничего не считаем
    expect(await refreshSchedule(store, 'nobody', NOW)).toBe(0);
  });

  it('итоги недели: в расписании на воскресенье, текст считается в момент отправки', async () => {
    const { d, call, due } = await setup('Europe/Moscow');
    await call('add_task', { title: 'Отчёт', date: '2026-11-20' });
    const weekly = (await due()).find((r) => r.key === 'weekly:2026-11-22');
    expect(weekly?.title).toBe('Итоги недели, 16–22 ноября');
    expect(weekly?.fireAt).toBe(Date.UTC(2026, 10, 22, 16, 0));
    // После расчёта расписания задачу сделали — в отправленных итогах это уже видно
    d.now = () => NOW + 60_000;
    const day = await call('get_day', { date: '2026-11-20' });
    const id = /Отчёт \[id: ([^\]]+)\]/.exec(day)?.[1] ?? '';
    expect(await call('complete_task', { id })).toContain('Отметил');
    const sent: { title: string; body: string }[] = [];
    await sendDue({ ...d, now: () => Date.UTC(2026, 10, 22, 16, 1), send: (_env, _to, data) => { sent.push(data as { title: string; body: string }); return Promise.resolve({ status: 201, detail: '' }); } });
    const msg = sent.find((x) => x.title.startsWith('Итоги недели'));
    expect(msg?.body).toContain('✅ Задачи: 1 из 1');
  });
});
