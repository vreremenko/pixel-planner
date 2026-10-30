/* Репозитории планировщика: задачи, повторы, привычки. */
import { db } from '../../../core/data/db';
import { alive } from '../../../core/data/repo';
import type { LocalDate } from '../../../core/domain/types';
import type { Habit, HabitLog, OccurrenceOverride, RecurringSeries, Task } from '../domain/types';

/**
 * Таблицы модуля (схема — в ../tables.ts). Берутся из базы при каждом обращении: после обновления
 * схемы Dexie пересоздаёт объекты таблиц, и сохранённые заранее перестают оповещать об изменениях.
 */
export const tables = {
  get tasks() {
    return db.table<Task, string>('tasks');
  },
  get series() {
    return db.table<RecurringSeries, string>('series');
  },
  get overrides() {
    return db.table<OccurrenceOverride, string>('overrides');
  },
  get habits() {
    return db.table<Habit, string>('habits');
  },
  get habitLogs() {
    return db.table<HabitLog, string>('habitLogs');
  },
};

export const taskRepo = {
  async get(id: string) {
    const t = await tables.tasks.get(id);
    return alive(t) ? t : undefined;
  },
  async byDate(date: LocalDate) {
    return (await tables.tasks.where('date').equals(date).toArray()).filter(alive);
  },
  async byDateRange(from: LocalDate, to: LocalDate) {
    return (await tables.tasks.where('date').between(from, to, true, true).toArray()).filter(alive);
  },
  async backlog() {
    return (await tables.tasks.filter((t) => t.date === null).toArray()).filter(alive);
  },
  async all() {
    return (await tables.tasks.toArray()).filter(alive);
  },
  async put(t: Task) {
    await tables.tasks.put({ ...t, updatedAt: Date.now() });
  },
  async bulkPut(ts: Task[]) {
    const now = Date.now();
    await tables.tasks.bulkPut(ts.map((t) => ({ ...t, updatedAt: now })));
  },
  async remove(id: string) {
    await tables.tasks.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const seriesRepo = {
  async all() {
    return (await tables.series.toArray()).filter(alive);
  },
  async get(id: string) {
    const s = await tables.series.get(id);
    return alive(s) ? s : undefined;
  },
  async put(s: RecurringSeries) {
    await tables.series.put({ ...s, updatedAt: Date.now() });
  },
  async remove(id: string) {
    await tables.series.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const overrideRepo = {
  async all() {
    return (await tables.overrides.toArray()).filter(alive);
  },
  async get(id: string) {
    const o = await tables.overrides.get(id);
    return alive(o) ? o : undefined;
  },
  async bySeries(seriesId: string) {
    return (await tables.overrides.where('seriesId').equals(seriesId).toArray()).filter(alive);
  },
  async put(o: OccurrenceOverride) {
    await tables.overrides.put({ ...o, updatedAt: Date.now() });
  },
};

export const habitRepo = {
  async all() {
    return (await tables.habits.toArray()).filter(alive);
  },
  async get(id: string) {
    const h = await tables.habits.get(id);
    return alive(h) ? h : undefined;
  },
  async put(h: Habit) {
    await tables.habits.put({ ...h, updatedAt: Date.now() });
  },
  async remove(id: string) {
    await tables.habits.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
  },
};

export const habitLogRepo = {
  async all() {
    return (await tables.habitLogs.toArray()).filter(alive);
  },
  async byHabit(habitId: string) {
    return (await tables.habitLogs.where('habitId').equals(habitId).toArray()).filter(alive);
  },
  async byDateRange(from: LocalDate, to: LocalDate) {
    return (await tables.habitLogs.where('date').between(from, to, true, true).toArray()).filter(alive);
  },
  async isDone(habitId: string, date: LocalDate) {
    return alive(await tables.habitLogs.get(`${habitId}:${date}`));
  },
  /** Записать значение за день (счётная привычка); заменяет прежнее. */
  async setValue(habitId: string, date: LocalDate, value: number) {
    const id = `${habitId}:${date}`;
    const now = Date.now();
    const cur = await tables.habitLogs.get(id);
    await tables.habitLogs.put({ id, habitId, date, value, createdAt: cur?.createdAt ?? now, updatedAt: now });
  },
  async set(habitId: string, date: LocalDate, done: boolean) {
    const id = `${habitId}:${date}`;
    const now = Date.now();
    if (done) {
      await tables.habitLogs.put({ id, habitId, date, createdAt: now, updatedAt: now });
    } else {
      await tables.habitLogs.update(id, { deletedAt: now, updatedAt: now });
    }
  },
};
