/*
 * Репозитории — единственная точка доступа к хранилищу.
 * UI и сервисы не знают про Dexie: чтобы добавить синхронизацию, достаточно
 * заменить реализацию здесь (все записи имеют updatedAt и мягкое удаление).
 */
import { db } from './db';
import type {
  AchievementUnlock,
  Habit,
  LocalDate,
  OccurrenceOverride,
  RecurringSeries,
  ReminderLog,
  Settings,
  SyncMeta,
  Task,
  XpEvent,
} from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import { currentTimeZone } from '../domain/dates';

export const newId = (): string => crypto.randomUUID();
const alive = <T extends SyncMeta>(x: T | undefined): x is T => x !== undefined && !x.deletedAt;

export function stamp<T extends Partial<SyncMeta>>(x: T): T & SyncMeta {
  const now = Date.now();
  return { ...x, id: x.id ?? newId(), createdAt: x.createdAt ?? now, updatedAt: now };
}

export const taskRepo = {
  async get(id: string) {
    const t = await db.tasks.get(id);
    return alive(t) ? t : undefined;
  },
  async byDate(date: LocalDate) {
    return (await db.tasks.where('date').equals(date).toArray()).filter(alive);
  },
  async byDateRange(from: LocalDate, to: LocalDate) {
    return (await db.tasks.where('date').between(from, to, true, true).toArray()).filter(alive);
  },
  async backlog() {
    return (await db.tasks.filter((t) => t.date === null).toArray()).filter(alive);
  },
  async all() {
    return (await db.tasks.toArray()).filter(alive);
  },
  async put(t: Task) {
    await db.tasks.put({ ...t, updatedAt: Date.now() });
  },
  async bulkPut(ts: Task[]) {
    const now = Date.now();
    await db.tasks.bulkPut(ts.map((t) => ({ ...t, updatedAt: now })));
  },
  async remove(id: string) {
    await db.tasks.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const seriesRepo = {
  async all() {
    return (await db.series.toArray()).filter(alive);
  },
  async get(id: string) {
    const s = await db.series.get(id);
    return alive(s) ? s : undefined;
  },
  async put(s: RecurringSeries) {
    await db.series.put({ ...s, updatedAt: Date.now() });
  },
  async remove(id: string) {
    await db.series.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const overrideRepo = {
  async all() {
    return (await db.overrides.toArray()).filter(alive);
  },
  async get(id: string) {
    const o = await db.overrides.get(id);
    return alive(o) ? o : undefined;
  },
  async bySeries(seriesId: string) {
    return (await db.overrides.where('seriesId').equals(seriesId).toArray()).filter(alive);
  },
  async put(o: OccurrenceOverride) {
    await db.overrides.put({ ...o, updatedAt: Date.now() });
  },
};

export const habitRepo = {
  async all() {
    return (await db.habits.toArray()).filter(alive);
  },
  async get(id: string) {
    const h = await db.habits.get(id);
    return alive(h) ? h : undefined;
  },
  async put(h: Habit) {
    await db.habits.put({ ...h, updatedAt: Date.now() });
  },
  async remove(id: string) {
    await db.habits.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const habitLogRepo = {
  async all() {
    return (await db.habitLogs.toArray()).filter(alive);
  },
  async byHabit(habitId: string) {
    return (await db.habitLogs.where('habitId').equals(habitId).toArray()).filter(alive);
  },
  async byDateRange(from: LocalDate, to: LocalDate) {
    return (await db.habitLogs.where('date').between(from, to, true, true).toArray()).filter(alive);
  },
  async isDone(habitId: string, date: LocalDate) {
    return alive(await db.habitLogs.get(`${habitId}:${date}`));
  },
  /** Записать значение за день (счётная привычка); заменяет прежнее. */
  async setValue(habitId: string, date: LocalDate, value: number) {
    const id = `${habitId}:${date}`;
    const now = Date.now();
    const cur = await db.habitLogs.get(id);
    await db.habitLogs.put({ id, habitId, date, value, createdAt: cur?.createdAt ?? now, updatedAt: now });
  },
  async set(habitId: string, date: LocalDate, done: boolean) {
    const id = `${habitId}:${date}`;
    const now = Date.now();
    if (done) {
      await db.habitLogs.put({ id, habitId, date, createdAt: now, updatedAt: now });
    } else {
      await db.habitLogs.update(id, { deletedAt: now, updatedAt: now });
    }
  },
};

export const xpRepo = {
  async all() {
    return (await db.xp.toArray()).filter(alive);
  },
  async total() {
    return (await this.all()).reduce((s, e) => s + e.amount, 0);
  },
  /** Идемпотентно: повторное начисление с тем же id ничего не меняет. Возвращает true, если начислено. */
  async award(e: Omit<XpEvent, 'createdAt' | 'updatedAt'>) {
    const existing = await db.xp.get(e.id);
    if (alive(existing)) return false;
    const now = Date.now();
    await db.xp.put({ ...e, createdAt: now, updatedAt: now });
    return true;
  },
  async revoke(id: string) {
    const existing = await db.xp.get(id);
    if (!alive(existing)) return;
    await db.xp.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const achievementRepo = {
  async all() {
    return (await db.achievements.toArray()).filter(alive);
  },
  async unlock(achievementId: string) {
    const now = Date.now();
    const u: AchievementUnlock = { id: achievementId, achievementId, unlockedAt: now, createdAt: now, updatedAt: now };
    await db.achievements.put(u);
  },
};

export const reminderLogRepo = {
  async get(key: string) {
    return db.reminderLogs.get(key);
  },
  async put(r: ReminderLog) {
    await db.reminderLogs.put({ ...r, updatedAt: Date.now() });
  },
  async unacknowledged(before: number) {
    return (await db.reminderLogs.where('fireAt').below(before).toArray()).filter(
      (r) => alive(r) && !r.acknowledged,
    );
  },
  async acknowledge(keys: string[]) {
    const now = Date.now();
    await db.reminderLogs.where('id').anyOf(keys).modify({ acknowledged: true, updatedAt: now });
  },
  async snoozed(after: number) {
    return (await db.reminderLogs.toArray()).filter(
      (r) => alive(r) && r.snoozedUntil !== undefined && r.snoozedUntil > after,
    );
  },
};

export const settingsRepo = {
  async get(): Promise<Settings> {
    const s = await db.settings.get('settings');
    return { ...DEFAULT_SETTINGS, timeZone: currentTimeZone(), ...s };
  },
  async patch(p: Partial<Omit<Settings, 'id'>>) {
    const cur = await this.get();
    await db.settings.put({ ...cur, ...p, id: 'settings', updatedAt: Date.now() });
  },
};

export const metaRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await db.meta.get(key))?.value as T | undefined;
  },
  async set(key: string, value: unknown) {
    await db.meta.put({ key, value });
  },
};

/** Есть ли в базе данные пользователя (задачи, повторы, привычки) — чтобы отличить новую установку. */
export async function hasUserData(): Promise<boolean> {
  return (await db.tasks.count()) + (await db.series.count()) + (await db.habits.count()) > 0;
}
