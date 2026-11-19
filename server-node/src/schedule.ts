/*
 * Сервер сам считает расписание напоминаний аккаунта — теми же функциями, что и приложение.
 * Нужно, когда данные меняются не в приложении (нейросеть через MCP), и чтобы расписание продлевалось,
 * даже если приложение долго не открывали (иначе напоминания кончались через неделю).
 */
import { AccountData } from '../../src/assistant/data.ts';
import { digestData, planAccount } from '../../src/modules/accountReminders.ts';
import { digestText } from '../../src/modules/weeklyDigest.ts';
import type { ScheduleItem, Store, SyncIn } from './types.ts';

/** Пояс по умолчанию, пока устройство не сообщило свой. */
export const DEFAULT_TZ = 'Europe/Moscow';
/** На сколько вперёд считаем: как приложение. */
const HORIZON_MS = 7 * 86_400_000;
/** Запас назад: только что наступившее напоминание сервер мог ещё не разослать. */
const LOOKBACK_MS = 60_000;
const PULL_PAGE = 2000;

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64 || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Дата «сегодня» в поясе пользователя: ГГГГ-ММ-ДД. */
export const todayIn = (now: number, tz: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/**
 * Выполнить расчёт в поясе пользователя. Функции дат приложения работают в поясе процесса, а Node меняет его
 * на лету через TZ. Расчёт синхронный, поэтому другие запросы в этот момент не выполняются и пояс не «протекает».
 */
export function withTimeZone<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

export async function loadAccount(store: Store, userId: string): Promise<AccountData> {
  const rows: SyncIn[] = [];
  for (let after = 0; ; ) {
    const page = await store.syncPull(userId, after, PULL_PAGE);
    rows.push(...page);
    if (page.length < PULL_PAGE) break;
    after = page[page.length - 1]?.seq ?? after;
  }
  return new AccountData(rows);
}

/** Расписание аккаунта на неделю вперёд в поясе пользователя. */
export function planItems(data: AccountData, tz: string, now: number): ScheduleItem[] {
  return withTimeZone(tz, () => planAccount(data, new Date(now - LOOKBACK_MS), new Date(now + HORIZON_MS))).map(({ key, fireAt, kind, ref, date, title, body }) => ({ key, fireAt, kind, ref, date, title, body }));
}

/** Свежий текст «Итогов недели» — в момент отправки, чтобы попал и сегодняшний вечер. null — не удалось. */
export async function weeklyBody(store: Store, userId: string, end: string): Promise<string | null> {
  const tz = (await store.scheduleMetaGet(userId)).tz;
  const data = await loadAccount(store, userId);
  const text = withTimeZone(isTimeZone(tz) ? tz : DEFAULT_TZ, () => digestText(digestData(data), end));
  return text || null;
}

/** Пересчитать и разослать расписание по всем устройствам пользователя; без устройств — ничего. Возвращает число напоминаний. */
export async function refreshSchedule(store: Store, userId: string, now: number, data?: AccountData): Promise<number> {
  const devices = await store.devicesOfUser(userId);
  if (devices.length === 0) return 0;
  const tz = (await store.scheduleMetaGet(userId)).tz ?? DEFAULT_TZ;
  const items = planItems(data ?? (await loadAccount(store, userId)), isTimeZone(tz) ? tz : DEFAULT_TZ, now);
  for (const id of devices) await store.scheduleReplace(id, items, now);
  await store.scheduleMetaSet(userId, { acceptedAt: now, count: items.length });
  return items.length;
}

/** Продлить расписание всем, у кого есть устройства (раз в несколько часов). */
export async function refreshAll(store: Store, now: number): Promise<number> {
  let n = 0;
  for (const userId of await store.usersWithDevices()) {
    try {
      await refreshSchedule(store, userId, now);
      n++;
    } catch (e) {
      console.error('расписание не пересчитано', userId, e);
    }
  }
  return n;
}
