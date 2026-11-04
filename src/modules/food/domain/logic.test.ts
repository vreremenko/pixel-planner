import { describe, expect, it } from 'vitest';
import { bmr, calcGoal, dishPer100, frequentFoods, macroLine, portionOf, recentFoods, searchFoods, sumEntries } from './logic';
import type { FoodEntry, Meal } from './types';

const m = { kcal: 100, protein: 10, fat: 5, carbs: 20 };
let t = 0;
const entry = (foodId: string, meal: Meal, grams = 100): FoodEntry => ({ id: String(++t), createdAt: t, updatedAt: t, date: '2026-11-04', meal, grams, name: foodId, foodId, ...m });

describe('КБЖУ порции и дня', () => {
  it('порция считается от значений на 100 г', () => {
    expect(portionOf({ kcal: 121, protein: 17, fat: 5, carbs: 1.8 }, 180)).toEqual({ kcal: 218, protein: 30.6, fat: 9, carbs: 3.2 });
  });
  it('сумма дня округляется один раз', () => {
    expect(sumEntries([{ ...m, grams: 150 }, { ...m, grams: 50 }])).toEqual({ kcal: 200, protein: 20, fat: 10, carbs: 40 });
    expect(sumEntries([])).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  });
  it('подпись БЖУ', () => {
    expect(macroLine({ kcal: 0, protein: 16.6, fat: 5, carbs: 1.8 })).toBe('Б17 Ж5 У2');
  });
});

describe('блюдо из ингредиентов', () => {
  const items = [{ name: 'Курица', grams: 200, kcal: 110, protein: 23, fat: 2, carbs: 0 }, { name: 'Гречка', grams: 100, kcal: 310, protein: 12, fat: 3, carbs: 60 }];
  it('на 100 г — по сумме весов', () => {
    expect(dishPer100(items)).toMatchObject({ kcal: 177, protein: 19.3 });
  });
  it('уварка: готовый вес меньше — на 100 г больше', () => {
    expect(dishPer100(items, 150).kcal).toBe(353);
  });
  it('пустое блюдо — нули', () => {
    expect(dishPer100([])).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  });
});

describe('цель', () => {
  const p = { sex: 'male', age: 30, height: 180, weight: 80, activity: 1.55, goal: 'keep' } as const;
  it('базовый обмен по Миффлину — Сан-Жеору', () => {
    expect(bmr(p)).toBe(1780);
    expect(bmr({ ...p, sex: 'female' })).toBe(1614);
  });
  it('цель меняет калории и белок, углеводы — остаток', () => {
    expect(calcGoal(p)).toEqual({ kcal: 2760, protein: 128, fat: 72, carbs: 400 });
    expect(calcGoal({ ...p, goal: 'lose' }).kcal).toBe(2350);
    expect(calcGoal({ ...p, goal: 'gain' }).kcal).toBe(3030);
  });
});

describe('поиск и подсказки', () => {
  it('недавние: сначала этот приём пищи, без повторов, с последней граммовкой', () => {
    const list = [entry('овсянка', 'breakfast', 200), entry('борщ', 'lunch'), entry('овсянка', 'breakfast', 250)];
    expect(recentFoods(list, 'breakfast').map((x) => [x.name, x.lastGrams])).toEqual([['овсянка', 250], ['борщ', 100]]);
  });
  it('частые: по количеству, приём пищи весит вдвое', () => {
    const list = [entry('кофе', 'lunch'), entry('кофе', 'lunch'), entry('каша', 'breakfast'), entry('каша', 'breakfast'), entry('каша', 'lunch')];
    expect(frequentFoods(list, 'breakfast').map((x) => x.name)).toEqual(['каша', 'кофе']);
  });
  it('слова в любом порядке, ё = е, начало названия выше', () => {
    const list = [{ name: 'Сыр творожный' }, { name: 'Творог 5%' }, { name: 'Мёд' }];
    expect(searchFoods(list, 'твор').map((x) => x.name)).toEqual(['Творог 5%', 'Сыр творожный']);
    expect(searchFoods(list, 'творожный сыр')).toHaveLength(1);
    expect(searchFoods(list, 'мед')).toHaveLength(1);
    expect(searchFoods(list, '  ')).toEqual([]);
  });
});
