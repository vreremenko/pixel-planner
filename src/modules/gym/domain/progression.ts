/*
 * Подсказка прогрессии («двойная прогрессия»): сначала добираете повторы до верха диапазона программы во всех
 * рабочих подходах, потом добавляете вес. Шаг — около 2,5% для верха тела и 5% для ног, округлённый до шага снаряда
 * (у каждого упражнения свой: штанга 2,5 кг, гантели 2 кг, тренажёр 5 кг). Вес ничего не меняет сам — только подсказывает.
 */
import type { ExerciseGroup, WorkoutSet } from './types';

/** Шаг снаряда по умолчанию, кг. */
export const DEFAULT_WEIGHT_STEP = 2.5;

/** Верх диапазона повторов из программы: «8–12» → 12, «10» → 10; нет чисел — null. */
export function topReps(target: string | undefined): number | null {
  const nums = (target ?? '').match(/\d+/g)?.map(Number).filter((n) => n > 0 && n <= 100) ?? [];
  return nums.length ? Math.max(...nums) : null;
}

export interface Suggestion {
  /** Рабочий вес прошлого раза. */
  from: number;
  weight: number;
  reps: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Пора ли добавить вес: в прошлый раз все подходы с рабочим (самым большим) весом дошли до верха диапазона.
 * `last` — подходы прошлой тренировки этого упражнения.
 */
export function suggestWeight(last: readonly WorkoutSet[], repsTarget: string | undefined, group: ExerciseGroup, step = DEFAULT_WEIGHT_STEP): Suggestion | null {
  const top = topReps(repsTarget);
  if (top === null || step <= 0) return null;
  const work = last.filter((s) => s.done && (s.weight ?? 0) > 0 && s.reps !== undefined);
  if (work.length === 0) return null;
  const from = Math.max(...work.map((s) => s.weight ?? 0));
  const heavy = work.filter((s) => s.weight === from);
  if (!heavy.every((s) => (s.reps ?? 0) >= top)) return null;
  const pct = group === 'legs' ? 0.05 : 0.025;
  const inc = Math.max(step, Math.round((from * pct) / step) * step);
  return { from, weight: round2(from + inc), reps: top };
}

/** «60», «62,5» — вес для текста. */
export const kgText = (n: number) => String(round2(n)).replace('.', ',');
