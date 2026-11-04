/* Репозитории питания. Таблицы берутся из базы при каждом обращении (см. planner/data/repo.ts). */
import { db } from '../../../core/data/db';
import { alive, stamp } from '../../../core/data/repo';
import type { LocalDate, SyncMeta } from '../../../core/domain/types';
import type { FoodEntry, FoodItem, FoodPrefs } from '../domain/types';

const tables = {
  get items() {
    return db.table<FoodItem, string>('food_items');
  },
  get entries() {
    return db.table<FoodEntry, string>('food_entries');
  },
  get prefs() {
    return db.table<FoodPrefs, string>('food_prefs');
  },
};

const removeRow = async (t: { update: (id: string, c: object) => Promise<unknown> }, id: string) => {
  const now = Date.now();
  await t.update(id, { deletedAt: now, updatedAt: now });
};

export const itemRepo = {
  all: async () => (await tables.items.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  get: async (id: string) => {
    const x = await tables.items.get(id);
    return alive(x) ? x : undefined;
  },
  save: async (x: Omit<FoodItem, keyof SyncMeta> & Partial<SyncMeta>) => {
    const row: FoodItem = stamp(x);
    await tables.items.put(row);
    return row;
  },
  remove: (id: string) => removeRow(tables.items, id),
};

export const entryRepo = {
  byDate: async (date: LocalDate) => (await tables.entries.where('date').equals(date).toArray()).filter(alive).sort((a, b) => a.createdAt - b.createdAt),
  /** Записи за период, для подсказок «недавнее» и «частое». */
  byRange: async (from: LocalDate, to: LocalDate) => (await tables.entries.where('date').between(from, to, true, true).toArray()).filter(alive),
  save: async (x: Omit<FoodEntry, keyof SyncMeta> & Partial<SyncMeta>) => {
    const row: FoodEntry = stamp(x);
    await tables.entries.put(row);
    return row;
  },
  remove: (id: string) => removeRow(tables.entries, id),
};

export const prefsRepo = {
  get: async (): Promise<FoodPrefs> => {
    const p = await tables.prefs.get('prefs');
    return alive(p) ? p : { id: 'prefs', createdAt: 0, updatedAt: 0 };
  },
  patch: async (p: Partial<Omit<FoodPrefs, keyof SyncMeta>>) => {
    const cur = await prefsRepo.get();
    await tables.prefs.put({ ...cur, ...p, updatedAt: Date.now() });
  },
};
