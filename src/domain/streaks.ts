import { addDays, dateOf, weekday } from './dates';
import type { Habit, HabitSchedule, LocalDate } from './types';

export function isScheduled(schedule: HabitSchedule, d: LocalDate): boolean {
  return schedule.type === 'daily' || schedule.days.includes(weekday(d));
}

export interface StreakInfo {
  current: number;
  best: number;
}

/**
 * Стрик считается только по запланированным дням: невыбранные дни пропускаются
 * и стрик не обнуляют. Сегодняшний невыполненный день стрик ещё не рвёт.
 * `since` — дата создания привычки: раньше неё дни не учитываются.
 */
export function computeStreak(
  schedule: HabitSchedule,
  doneDates: ReadonlySet<LocalDate>,
  todayDate: LocalDate,
  since: LocalDate,
): StreakInfo {
  // Отметки в незапланированные дни тоже засчитываются (не ломают и не продлевают ряд).
  let current = 0;
  let d = todayDate;
  if (isScheduled(schedule, d) && !doneDates.has(d)) d = addDays(d, -1);
  for (; d >= since; d = addDays(d, -1)) {
    if (!isScheduled(schedule, d)) {
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
    } else if (isScheduled(schedule, x) && x !== todayDate) {
      run = 0;
    }
    if (run > best) best = run;
  }
  return { current, best: Math.max(best, current) };
}

export function habitStreak(
  habit: Pick<Habit, 'schedule' | 'createdAt'>,
  doneDates: ReadonlySet<LocalDate>,
  todayDate: LocalDate,
): StreakInfo {
  return computeStreak(habit.schedule, doneDates, todayDate, dateOf(new Date(habit.createdAt)));
}
