/*
 * Сводка для админки. Только количества: содержимое записей сюда не попадает.
 * Активность считается по дням (UTC): день пользователя отмечается при любом запросе с его сессией.
 */
import type { ActivityRow, AdminRecordRow, AdminUserRow } from './types.ts';

const DAY = 86_400_000;
/** Столбцов на графике: при большем числе подписи на телефоне не читаются. */
const CHART_DAYS = 7;

export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Раздел таблицы синхронизации; настройки разделов не считаем: это не работа с приложением. */
function moduleOf(table: string): string | null {
  if (table.endsWith('_prefs')) return null;
  if (table.startsWith('food_')) return 'Питание';
  if (table.startsWith('fin_')) return 'Финансы';
  if (table.startsWith('gym_')) return 'Тренировки';
  if (table.startsWith('habit')) return 'Привычки';
  return 'Задачи';
}

export interface StatsInput {
  now: number;
  admins: readonly string[];
  users: readonly AdminUserRow[];
  activity: readonly ActivityRow[];
  records: readonly AdminRecordRow[];
}

export function buildStats({ now, admins, users, activity, records }: StatsInput) {
  const days = Array.from({ length: CHART_DAYS }, (_, i) => dayOf(now - (CHART_DAYS - 1 - i) * DAY));
  const within = (from: number, to: number) => {
    const first = dayOf(now - from * DAY);
    const last = dayOf(now - to * DAY);
    return new Set(activity.filter((a) => a.day >= first && a.day <= last).map((a) => a.userId));
  };
  const monthStart = dayOf(now - 29 * DAY);
  const week = within(6, 0);
  const previous = within(13, 7);

  const modules = new Map<string, { name: string; records: number; users: Set<string>; active: Set<string> }>();
  const perUser = new Map<string, Map<string, number>>();
  for (const r of records) {
    const name = moduleOf(r.table);
    if (name === null || r.records === 0) continue;
    const m = modules.get(name) ?? { name, records: 0, users: new Set(), active: new Set() };
    m.records += r.records;
    m.users.add(r.userId);
    if (r.recent > 0) m.active.add(r.userId);
    modules.set(name, m);
    const mine = perUser.get(r.userId) ?? new Map<string, number>();
    mine.set(name, (mine.get(name) ?? 0) + r.records);
    perUser.set(r.userId, mine);
  }

  return {
    since: activity.reduce<string | null>((a, x) => (a === null || x.day < a ? x.day : a), null),
    users: {
      total: users.length,
      new7: users.filter((u) => now - u.createdAt < 7 * DAY).length,
      new30: users.filter((u) => now - u.createdAt < 30 * DAY).length,
      withPush: users.filter((u) => u.pushDevices > 0).length,
    },
    active: { day: within(0, 0).size, week: week.size, month: within(29, 0).size },
    /** Кто был на прошлой неделе и вернулся на этой. */
    returned: { previous: previous.size, back: [...previous].filter((id) => week.has(id)).length },
    days: days.map((date) => ({ date, users: activity.filter((a) => a.day === date).length })),
    modules: [...modules.values()]
      .map((m) => ({ name: m.name, records: m.records, users: m.users.size, active: m.active.size }))
      .sort((a, b) => b.active - a.active || b.records - a.records),
    list: [...users]
      .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
      .map((u) => ({
        email: u.email,
        admin: admins.includes(u.email),
        verified: u.emailVerified,
        telegram: u.telegram,
        createdAt: u.createdAt,
        lastSeen: u.lastSeen,
        sessions: u.sessions,
        version: u.appVersion,
        activeDays: activity.filter((a) => a.userId === u.id && a.day >= monthStart).length,
        records: Object.fromEntries(perUser.get(u.id) ?? []),
      })),
  };
}
