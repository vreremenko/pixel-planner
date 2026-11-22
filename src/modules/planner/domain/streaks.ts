import { addDays, dateOf, weekday } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import type { Habit, HabitPause, HabitSchedule } from './types';

export function isScheduled(schedule: HabitSchedule, d: LocalDate): boolean {
  return schedule.type === 'daily' || schedule.days.includes(weekday(d));
}

const inPause = (p: HabitPause, d: LocalDate) => d >= p.from && (p.to === undefined || d <= p.to);

/** Стоит ли привычка на паузе в этот день. */
export function isPaused(habit: Pick<Habit, 'pauses'>, d: LocalDate): boolean {
  return (habit.pauses ?? []).some((p) => inPause(p, d));
}

/** Пауза, которая идёт сегодня или начнётся позже (её показываем на карточке). */
export function currentPause(habit: Pick<Habit, 'pauses'>, today: LocalDate): HabitPause | undefined {
  return (habit.pauses ?? []).find((p) => p.to === undefined || p.to >= today);
}

/** Ждёт ли привычка отметки в этот день: по расписанию и не на паузе. Везде, где решается «надо ли сегодня», — это. */
export function isDue(habit: Pick<Habit, 'schedule' | 'pauses'>, d: LocalDate): boolean {
  return isScheduled(habit.schedule, d) && !isPaused(habit, d);
}

/** Поставить на паузу с `from` по `to` включительно (без `to` — пока не вернут). Прошлые паузы сохраняются: по ним считается серия. */
export function withPause(habit: Pick<Habit, 'pauses'>, from: LocalDate, to?: LocalDate): HabitPause[] {
  const kept = (habit.pauses ?? []).filter((p) => p.to !== undefined && p.to < from);
  return [...kept, to === undefined ? { from } : { from, to: to < from ? from : to }];
}

/** Снять паузу с сегодняшнего дня: прошедшие дни паузы остаются паузой, будущие отменяются. */
export function withoutPause(habit: Pick<Habit, 'pauses'>, today: LocalDate): HabitPause[] {
  const yesterday = addDays(today, -1);
  return (habit.pauses ?? []).flatMap((p) => {
    if (p.to !== undefined && p.to < today) return [p];
    if (p.from >= today) return [];
    return [{ from: p.from, to: yesterday }];
  });
}

export interface StreakInfo {
  current: number;
  best: number;
}

/**
 * Стрик считается только по запланированным дням: невыбранные дни и дни паузы пропускаются
 * и стрик не обнуляют. Сегодняшний невыполненный день стрик ещё не рвёт.
 * `since` — дата создания привычки: раньше неё дни не учитываются.
 */
export function computeStreak(
  schedule: HabitSchedule,
  doneDates: ReadonlySet<LocalDate>,
  todayDate: LocalDate,
  since: LocalDate,
  paused: (d: LocalDate) => boolean = () => false,
): StreakInfo {
  const due = (d: LocalDate) => isScheduled(schedule, d) && !paused(d);
  // Отметки в незапланированные дни тоже засчитываются (не ломают и не продлевают ряд).
  let current = 0;
  let d = todayDate;
  if (due(d) && !doneDates.has(d)) d = addDays(d, -1);
  for (; d >= since; d = addDays(d, -1)) {
    if (!due(d)) {
      if (doneDates.has(d)) current++;
      continue;
    }
    if (doneDates.has(d)) current++;
    else break;
  }

  let best = 0;
  let run = 0;
  let earliest = since;
  for (const x of doneDates) if (x < earliest) earliest = x;
  for (let x = earliest; x <= todayDate; x = addDays(x, 1)) {
    const done = doneDates.has(x);
    if (done) {
      run++;
    } else if (due(x) && x !== todayDate) {
      run = 0;
    }
    if (run > best) best = run;
  }
  return { current, best: Math.max(best, current) };
}

export function habitStreak(
  habit: Pick<Habit, 'schedule' | 'createdAt' | 'pauses'>,
  doneDates: ReadonlySet<LocalDate>,
  todayDate: LocalDate,
): StreakInfo {
  return computeStreak(habit.schedule, doneDates, todayDate, dateOf(new Date(habit.createdAt)), (d) => isPaused(habit, d));
}
