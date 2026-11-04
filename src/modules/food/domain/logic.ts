/* Расчёты раздела питания: чистые функции без базы. */
import type { FoodEntry, FoodRef, Ingredient, Macros, Meal, Profile } from './types';

export const ZERO: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** КБЖУ порции из значений на 100 г. */
export function portionOf(per100: Macros, grams: number): Macros {
  const k = grams / 100;
  return { kcal: Math.round(per100.kcal * k), protein: round1(per100.protein * k), fat: round1(per100.fat * k), carbs: round1(per100.carbs * k) };
}

/** Сумма записей дневника. Округляем один раз в конце, чтобы мелкие порции не теряли точность. */
export function sumEntries(entries: readonly (Macros & { grams: number })[]): Macros {
  const t = entries.reduce(
    (a, e) => ({ kcal: a.kcal + (e.kcal * e.grams) / 100, protein: a.protein + (e.protein * e.grams) / 100, fat: a.fat + (e.fat * e.grams) / 100, carbs: a.carbs + (e.carbs * e.grams) / 100 }),
    ZERO,
  );
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), fat: round1(t.fat), carbs: round1(t.carbs) };
}

/** Значения блюда на 100 г: сумма ингредиентов, делённая на вес готового блюда (нет — на сумму их весов). */
export function dishPer100(items: readonly Ingredient[], cookedWeight?: number): Macros {
  const raw = items.reduce((s, i) => s + i.grams, 0);
  const weight = cookedWeight && cookedWeight > 0 ? cookedWeight : raw;
  if (weight <= 0) return ZERO;
  const total = sumEntries(items);
  return portionOf(total, (100 * 100) / weight);
}

/** Базовый обмен по формуле Миффлина — Сан-Жеора, ккал в сутки. */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'height' | 'weight'>): number {
  return 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

const GOAL_FACTOR = { lose: 0.85, keep: 1, gain: 1.1 } as const;
const PROTEIN_PER_KG = { lose: 2, keep: 1.6, gain: 1.8 } as const;
const FAT_PER_KG = 0.9;

/** Норма на день: калории от обмена и активности, белок и жиры от веса, углеводы — остаток калорий. */
export function calcGoal(p: Profile): Macros {
  const kcal = Math.round((bmr(p) * p.activity * GOAL_FACTOR[p.goal]) / 10) * 10;
  const protein = Math.round(p.weight * PROTEIN_PER_KG[p.goal]);
  const fat = Math.round(p.weight * FAT_PER_KG);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs };
}

const foodKey = (e: Pick<FoodEntry, 'foodId'>) => e.foodId;

/** Запись дневника как еда для повторного добавления; запоминаем последнюю граммовку. */
const refOf = (e: FoodEntry): FoodRef & { lastGrams: number } => ({
  id: e.foodId,
  name: e.name,
  kcal: e.kcal,
  protein: e.protein,
  fat: e.fat,
  carbs: e.carbs,
  lastGrams: e.grams,
  ...(e.brand ? { brand: e.brand } : {}),
  ...(e.portion ? { portion: e.portion } : {}),
});

/** Недавнее: последние разные продукты; записи этого приёма пищи — первыми. */
export function recentFoods(entries: readonly FoodEntry[], meal: Meal, limit = 12): (FoodRef & { lastGrams: number })[] {
  const sorted = [...entries].sort((a, b) => Number(b.meal === meal) - Number(a.meal === meal) || b.createdAt - a.createdAt);
  const seen = new Set<string>();
  const out: (FoodRef & { lastGrams: number })[] = [];
  for (const e of sorted) {
    if (seen.has(foodKey(e))) continue;
    seen.add(foodKey(e));
    out.push(refOf(e));
    if (out.length === limit) break;
  }
  return out;
}

/** Частое: что ешь чаще всего; записи этого приёма пищи весят вдвое больше. */
export function frequentFoods(entries: readonly FoodEntry[], meal: Meal, limit = 20): (FoodRef & { lastGrams: number })[] {
  const score = new Map<string, { n: number; last: FoodEntry }>();
  for (const e of entries) {
    const cur = score.get(foodKey(e));
    const add = e.meal === meal ? 2 : 1;
    score.set(foodKey(e), { n: (cur?.n ?? 0) + add, last: !cur || e.createdAt > cur.last.createdAt ? e : cur.last });
  }
  return [...score.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((x) => refOf(x.last));
}

const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е');

/** Поиск по словам в любом порядке; названия, начинающиеся с запроса, — выше. */
export function searchFoods<T extends { name: string; brand?: string }>(list: readonly T[], query: string, limit = 30): T[] {
  const q = norm(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  const rank = (x: T) => (norm(x.name).startsWith(q) ? 0 : 1);
  return list
    .filter((x) => {
      const hay = norm(`${x.name} ${x.brand ?? ''}`);
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length)
    .slice(0, limit);
}

/** «Б17 Ж5 У2» для строки списка. */
export const macroLine = (m: Macros): string => `Б${String(Math.round(m.protein))} Ж${String(Math.round(m.fat))} У${String(Math.round(m.carbs))}`;
