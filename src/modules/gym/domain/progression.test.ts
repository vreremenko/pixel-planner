import { describe, expect, it } from 'vitest';
import { suggestWeight, topReps } from './progression';
import type { WorkoutSet } from './types';

const set = (weight: number, reps: number, done = true): WorkoutSet => ({ id: `${String(weight)}-${String(reps)}-${String(Math.random())}`, workoutId: 'w', exerciseId: 'e', date: '2026-11-18', order: 0, done, weight, reps, createdAt: 0, updatedAt: 0 });

describe('подсказка прогрессии', () => {
  it('верх диапазона повторов', () => {
    expect(topReps('8–12')).toBe(12);
    expect(topReps('10')).toBe(10);
    expect(topReps('')).toBeNull();
    expect(topReps(undefined)).toBeNull();
  });

  it('все рабочие подходы дошли до верха — предлагаем вес; иначе — нет', () => {
    expect(suggestWeight([set(60, 12), set(60, 12), set(60, 12)], '8–12', 'chest')).toEqual({ from: 60, weight: 62.5, reps: 12 });
    expect(suggestWeight([set(60, 12), set(60, 11), set(60, 12)], '8–12', 'chest')).toBeNull();
    // Разминочный подход с меньшим весом не мешает
    expect(suggestWeight([set(40, 8), set(60, 12), set(60, 13)], '8–12', 'chest')?.weight).toBe(62.5);
    // Невыполненные подходы не считаются
    expect(suggestWeight([set(60, 12), set(60, 5, false)], '8–12', 'chest')?.weight).toBe(62.5);
    expect(suggestWeight([set(60, 12)], undefined, 'chest')).toBeNull();
  });

  it('шаг: проценты, округлённые до шага снаряда, но не меньше шага', () => {
    // Ноги 5%: 100 → +5
    expect(suggestWeight([set(100, 10)], '6–10', 'legs')?.weight).toBe(105);
    // Ноги 5% от 140 = 7 → до шага 2,5 → 7,5
    expect(suggestWeight([set(140, 10)], '6–10', 'legs')?.weight).toBe(147.5);
    // Гантели с шагом 2 кг: 2,5% от 20 = 0,5 → не меньше шага → +2
    expect(suggestWeight([set(20, 12)], '8–12', 'arms', 2)?.weight).toBe(22);
    // Тренажёр с шагом 5: 2,5% от 50 → +5
    expect(suggestWeight([set(50, 15)], '12–15', 'back', 5)?.weight).toBe(55);
  });
});
