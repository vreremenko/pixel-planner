/* Репозитории финансов. Таблицы берутся из базы при каждом обращении (см. planner/data/repo.ts). */
import { db } from '../../../core/data/db';
import { alive, removeRow, saveRow, type New } from '../../../core/data/repo';
import type { SyncMeta } from '../../../core/domain/types';
import { DEFAULT_CATEGORIES, type Account, type Category, type FinPrefs, type Goal, type Payment, type Tx } from '../domain/types';

const tables = {
  get accounts() {
    return db.table<Account, string>('fin_accounts');
  },
  get categories() {
    return db.table<Category, string>('fin_categories');
  },
  get tx() {
    return db.table<Tx, string>('fin_tx');
  },
  get payments() {
    return db.table<Payment, string>('fin_payments');
  },
  get goals() {
    return db.table<Goal, string>('fin_goals');
  },
  get prefs() {
    return db.table<FinPrefs, string>('fin_prefs');
  },
};

export const accountRepo = {
  all: async () => (await tables.accounts.toArray()).filter(alive).sort((a, b) => a.createdAt - b.createdAt),
  save: (x: New<Account>) => saveRow(tables.accounts, x),
};

export const categoryRepo = {
  /** Стартовые категории и свои; правка стартовой хранится в базе под тем же id. */
  all: async (): Promise<Category[]> => {
    const rows = await tables.categories.toArray();
    const stored = new Map(rows.map((r) => [r.id, r]));
    const defaults = DEFAULT_CATEGORIES.map((c): Category => stored.get(c.id) ?? { ...c, createdAt: 0, updatedAt: 0 });
    return [...defaults, ...rows.filter((r) => !r.id.startsWith('def:'))].filter(alive);
  },
  save: (x: New<Category>) => saveRow(tables.categories, x),
};

export const txRepo = {
  all: async () => (await tables.tx.toArray()).filter(alive),
  save: (x: New<Tx>) => saveRow(tables.tx, x),
  remove: (id: string) => removeRow(tables.tx, id),
};

export const paymentRepo = {
  all: async () => (await tables.payments.toArray()).filter(alive),
  save: (x: New<Payment>) => saveRow(tables.payments, x),
  remove: (id: string) => removeRow(tables.payments, id),
};

export const goalRepo = {
  all: async () => (await tables.goals.toArray()).filter(alive).sort((a, b) => a.date.localeCompare(b.date)),
  save: (x: New<Goal>) => saveRow(tables.goals, x),
  remove: (id: string) => removeRow(tables.goals, id),
};

export const prefsRepo = {
  get: async (): Promise<FinPrefs> => {
    const p = await tables.prefs.get('prefs');
    return alive(p) ? p : { id: 'prefs', createdAt: 0, updatedAt: 0 };
  },
  /** Целиком: необязательное поле здесь можно и очистить. */
  put: async (p: Omit<FinPrefs, keyof SyncMeta>) => {
    await tables.prefs.put({ ...p, id: 'prefs', createdAt: 0, updatedAt: Date.now() });
  },
};
