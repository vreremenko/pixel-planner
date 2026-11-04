/* Сценарии дневника: записать, поправить, удалить, повторить приём пищи. */
import type { LocalDate } from '../../../core/domain/types';
import type { FoodEntry, FoodRef, Meal } from '../domain/types';
import { entryRepo, itemRepo } from '../data/repo';

/** Записать еду. Продукт из Open Food Facts при этом сохраняется в свои: найти его снова можно и без сети. */
export async function addEntry(date: LocalDate, meal: Meal, food: FoodRef, grams: number): Promise<void> {
  const { id: foodId, name, brand, portion, kcal, protein, fat, carbs } = food;
  const opt = { ...(brand ? { brand } : {}), ...(portion ? { portion } : {}) };
  if (foodId.startsWith('off:') && !(await itemRepo.get(foodId))) {
    await itemRepo.save({ id: foodId, kind: 'product', name, kcal, protein, fat, carbs, ...opt });
  }
  await entryRepo.save({ date, meal, grams, foodId, name, kcal, protein, fat, carbs, ...opt });
}

export const setGrams = (e: FoodEntry, grams: number) => entryRepo.save({ ...e, grams });
export const removeEntry = (id: string) => entryRepo.remove(id);

/** Повторить приём пищи из другого дня. */
export async function copyMeal(from: readonly FoodEntry[], date: LocalDate): Promise<void> {
  for (const e of from) {
    const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, ...rest } = e;
    await entryRepo.save({ ...rest, date });
  }
}
