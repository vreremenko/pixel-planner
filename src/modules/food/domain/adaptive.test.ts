import { describe, expect, it } from 'vitest';
import { addDays } from '../../../core/domain/dates';
import { adaptGoal, trendPerDay, type AdaptInput } from './adaptive';
import { calcGoal } from './logic';
import type { FoodEntry, Profile } from './types';

const TODAY = '2026-11-19';
const profile: Profile = { sex: 'male', age: 30, height: 180, weight: 84, activity: 1.375, goal: 'lose' };
const goal = { kcal: 2300, protein: 168, fat: 76, carbs: 236 };
/** Дни с записями еды: kcal в день. */
const food = (days: number, kcal: number): FoodEntry[] =>
  Array.from({ length: days }, (_, i) => ({ id: `f${String(i)}`, createdAt: 0, updatedAt: 0, date: addDays(TODAY, -1 - i), meal: 'lunch' as const, grams: 100, name: 'Еда', foodId: 'x', kcal, protein: 0, fat: 0, carbs: 0 }));
const weights = (pairs: [number, number][]) => pairs.map(([back, value]) => ({ date: addDays(TODAY, -back), value }));
const base: AdaptInput = { profile, goal, entries: [], weights: [], today: TODAY };

describe('норма подстраивается под вес', () => {
  it('тренд веса по точкам, а не по крайним взвешиваниям', () => {
    expect(trendPerDay(weights([[20, 84], [10, 83.5], [1, 83]]))).toBeCloseTo(-0.0527, 3);
    expect(trendPerDay([])).toBe(0);
  });

  it('по записям и весу: худеет медленнее плана — норма снижается, но не больше 150 ккал', () => {
    // Ест ~2300, вес стоит → расход ≈ 2300, для похудения нужно ≈ 1955 → шаг −150
    const r = adaptGoal({ ...base, entries: food(18, 2300), weights: weights([[20, 84], [14, 84.1], [7, 83.9], [1, 84]]) });
    expect(r?.goal.kcal).toBe(2150);
    expect(r?.note).toBe('Норма обновлена по вашему весу: 2\u00a0300 → 2\u00a0150 ккал.');
  });

  it('рано (меньше недели с прошлой подстройки) или мало данных и вес тот же — ничего не меняем', () => {
    expect(adaptGoal({ ...base, adaptedAt: addDays(TODAY, -3), entries: food(18, 2300), weights: weights([[20, 84], [1, 84]]) })).toBeNull();
    expect(adaptGoal({ ...base, entries: food(5, 2300), weights: weights([[2, 84]]) })).toBeNull();
  });

  it('еду не записывали, но вес изменился — пересчёт по формуле с новым весом, вес в профиле обновлён', () => {
    const r = adaptGoal({ ...base, weights: weights([[2, 81]]) });
    expect(r?.profile.weight).toBe(81);
    expect(r?.note).toBe('Норма обновлена по вашему весу: 2\u00a0300 → 2\u00a0150 ккал.');
    expect(r?.goal.kcal).toBeLessThan(2300);
    expect(r?.goal.kcal).toBeGreaterThanOrEqual(2150);
  });

  it('никогда не ниже базового обмена', () => {
    const r = adaptGoal({ ...base, goal: { ...goal, kcal: 1900 }, entries: food(18, 1500), weights: weights([[20, 84], [10, 84], [1, 84.2]]) });
    expect(r === null || r.goal.kcal >= 1800).toBe(true);
  });
});

describe('только вес изменился, норма почти та же', () => {
  it('обновляется вес в профиле без сообщения', () => {
    const kcal = calcGoal({ ...profile, weight: 84.4 }).kcal;
    const r = adaptGoal({ ...base, goal: { ...goal, kcal }, weights: weights([[2, 84.4]]) });
    expect(r?.profile.weight).toBe(84.4);
    expect(r?.note).toBe('');
  });
});
