/* Расчёты раздела тренировок: чистые функции без базы. */
import { WEEKDAYS_SHORT, weekday } from '../../../core/domain/dates';
import type { LocalDate, Weekday } from '../../../core/domain/types';
import type { ExerciseDef, Program, Tracking, Workout, WorkoutSet } from './types';

/** Расчётный максимум на одно повторение (формула Эпли); null — не силовой подход. */
export function e1rm(weight: number | undefined, reps: number | undefined): number | null {
  if (!weight || !reps || reps < 1) return null;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Числовая «сила» подхода для сравнения: по типу записи упражнения. */
export function setScore(s: WorkoutSet, tracking: Tracking): number {
  switch (tracking) {
    case 'weight_reps':
      return e1rm(s.weight, s.reps) ?? 0;
    case 'reps':
      return s.reps ?? 0;
    case 'time':
      return s.durationSec ?? 0;
    case 'distance_time':
      return s.distanceM ?? 0;
  }
}

/** Лучший выполненный подход упражнения (или undefined). */
export function bestSet(sets: readonly WorkoutSet[], tracking: Tracking): WorkoutSet | undefined {
  let best: WorkoutSet | undefined;
  for (const s of sets) if (s.done && setScore(s, tracking) > 0 && (!best || setScore(s, tracking) > setScore(best, tracking))) best = s;
  return best;
}

/** Подходы упражнения из последней завершённой тренировки до `before` — для подсказки «в прошлый раз». */
export function lastSessionSets(sets: readonly WorkoutSet[], workouts: readonly Workout[], exerciseId: string, beforeWorkoutId?: string): WorkoutSet[] {
  const finished = new Map(workouts.filter((w) => w.finishedAt && w.id !== beforeWorkoutId).map((w) => [w.id, w]));
  const mine = sets.filter((s) => s.exerciseId === exerciseId && s.done && finished.has(s.workoutId));
  const last = mine.reduce<Workout | undefined>((acc, s) => {
    const w = finished.get(s.workoutId);
    return w && (!acc || w.startedAt > acc.startedAt) ? w : acc;
  }, undefined);
  return last ? mine.filter((s) => s.workoutId === last.id).sort((a, b) => a.order - b.order) : [];
}

/** Дни программы, назначенные на этот день недели. */
export function programsFor(programs: readonly Program[], date: LocalDate): Program[] {
  const wd = weekday(date);
  return [...programs].filter((p) => p.days?.includes(wd)).sort((a, b) => a.order - b.order);
}

/** «Пн, Ср, Пт», «каждый день» или «без расписания». */
export function daysLabel(days: readonly Weekday[] | undefined): string {
  if (!days?.length) return 'без расписания';
  if (days.length === 7) return 'каждый день';
  return [...days].sort((a, b) => a - b).map((d) => WEEKDAYS_SHORT[d]).join(', ');
}

/** Упражнения тренировки по порядку их первого подхода. */
export function exerciseOrder(sets: readonly WorkoutSet[]): string[] {
  const first = new Map<string, number>();
  for (const s of sets) first.set(s.exerciseId, Math.min(first.get(s.exerciseId) ?? Infinity, s.order));
  return [...first].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

export interface WorkoutSummary {
  durationMin: number;
  setsDone: number;
  /** Тоннаж: сумма вес×повторы по силовым подходам, кг. */
  tonnage: number;
  /** Упражнения с новым рекордом. */
  records: string[];
}

/** Итог тренировки и новые рекорды относительно всех более ранних тренировок. */
export function summarize(workout: Workout, sets: readonly WorkoutSet[], history: readonly WorkoutSet[], historyWorkouts: readonly Workout[], defOf: (id: string) => ExerciseDef | undefined): WorkoutSummary {
  const mine = sets.filter((s) => s.workoutId === workout.id && s.done);
  const earlier = new Set(historyWorkouts.filter((w) => w.id !== workout.id && w.startedAt < workout.startedAt).map((w) => w.id));
  const records: string[] = [];
  for (const id of exerciseOrder(mine)) {
    const tracking = defOf(id)?.tracking ?? 'weight_reps';
    const now = bestSet(mine.filter((s) => s.exerciseId === id), tracking);
    if (!now) continue;
    const before = bestSet(history.filter((s) => s.exerciseId === id && earlier.has(s.workoutId)), tracking);
    if (before && setScore(now, tracking) > setScore(before, tracking)) records.push(id);
  }
  return {
    durationMin: Math.max(1, Math.round(((workout.finishedAt ?? Date.now()) - workout.startedAt) / 60_000)),
    setsDone: mine.length,
    tonnage: Math.round(mine.reduce((t, s) => t + (s.weight ?? 0) * (s.reps ?? 0), 0)),
    records,
  };
}

/** Короткая запись подхода: «60 × 10», «12 повт.», «1:30», «5 км · 25:00». */
export function formatSet(s: Pick<WorkoutSet, 'weight' | 'reps' | 'durationSec' | 'distanceM'>, tracking: Tracking): string {
  const time = (sec: number) => `${String(Math.floor(sec / 60))}:${String(sec % 60).padStart(2, '0')}`;
  switch (tracking) {
    case 'weight_reps':
      return `${String(s.weight ?? 0)} × ${String(s.reps ?? 0)}`;
    case 'reps':
      return `${String(s.reps ?? 0)} повт.`;
    case 'time':
      return time(s.durationSec ?? 0);
    case 'distance_time':
      return `${String(Math.round((s.distanceM ?? 0) / 100) / 10)} км${s.durationSec ? ` · ${time(s.durationSec)}` : ''}`;
  }
}
