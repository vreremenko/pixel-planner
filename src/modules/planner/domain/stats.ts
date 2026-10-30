import { dateOf, rangeDates, weekday } from '../../../core/domain/dates';
import { isScheduled } from './streaks';
import type { LocalDate } from '../../../core/domain/types';
import type { Habit, HabitLog, Occurrence, Task } from './types';

export interface StatsInput {
  tasks: readonly Task[];
  occurrences: readonly Occurrence[];
  habits: readonly Habit[];
  habitLogs: readonly HabitLog[];
  from: LocalDate;
  to: LocalDate;
  todayDate: LocalDate;
}

export interface PeriodStats {
  tasksClosed: number;
  fromBacklog: number;
  recurringDone: number;
  recurringTotal: number;
  /** 0..1 или null, если не было ни одного экземпляра. */
  recurringRate: number | null;
  habitsDone: number;
  habitsScheduled: number;
  habitRate: number | null;
  /** Закрыто всего (задачи + экземпляры + привычки) по датам. */
  perDay: Map<LocalDate, number>;
  /** Сумма по дням недели, 0 = Пн. */
  byWeekday: number[];
  total: number;
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

/** Дата, на которую засчитываем закрытие задачи: день выполнения в локальном поясе. */
function closedOn(t: Task): LocalDate | null {
  if (!t.done) return null;
  return t.doneAt !== undefined ? dateOf(new Date(t.doneAt)) : t.date;
}

export function computeStats(input: StatsInput): PeriodStats {
  const { from, to, todayDate } = input;
  const inRange = (d: LocalDate | null): d is LocalDate => d !== null && d >= from && d <= to;
  const perDay = new Map<LocalDate, number>();
  const bump = (d: LocalDate) => perDay.set(d, (perDay.get(d) ?? 0) + 1);

  let tasksClosed = 0;
  let fromBacklog = 0;
  for (const t of input.tasks) {
    if (t.deletedAt) continue;
    const d = closedOn(t);
    if (!inRange(d)) continue;
    tasksClosed++;
    if (t.wasInBacklog) fromBacklog++;
    bump(d);
  }

  let recurringDone = 0;
  let recurringTotal = 0;
  for (const o of input.occurrences) {
    if (!inRange(o.date) || o.date > todayDate) continue;
    if (o.status === 'skipped') continue; // явно пропущенные не портят процент
    if (o.date < todayDate || o.status === 'done') recurringTotal++;
    if (o.status === 'done') {
      recurringDone++;
      bump(o.date);
    }
  }

  const logSet = new Set<string>();
  for (const l of input.habitLogs) if (!l.deletedAt) logSet.add(`${l.habitId}:${l.date}`);
  let habitsDone = 0;
  let habitsScheduled = 0;
  const end = to < todayDate ? to : todayDate;
  for (const h of input.habits) {
    if (h.deletedAt) continue;
    const created = dateOf(new Date(h.createdAt));
    for (const d of rangeDates(from > created ? from : created, end)) {
      const done = logSet.has(`${h.id}:${d}`);
      const scheduled = isScheduled(h.schedule, d);
      // Сегодняшний невыполненный день ещё не провален
      if (scheduled && (d < todayDate || done)) habitsScheduled++;
      if (done) {
        habitsDone++;
        bump(d);
      }
    }
  }

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const [d, n] of perDay) {
    byWeekday[weekday(d)] = (byWeekday[weekday(d)] ?? 0) + n;
    total += n;
  }

  return {
    tasksClosed,
    fromBacklog,
    recurringDone,
    recurringTotal,
    recurringRate: ratio(recurringDone, recurringTotal),
    habitsDone,
    habitsScheduled,
    habitRate: ratio(Math.min(habitsDone, habitsScheduled), habitsScheduled),
    perDay,
    byWeekday,
    total,
  };
}

/** Изменение в процентах относительно прошлого периода; null если прошлый был нулевым. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export { heatLevel } from '../../../core/charts/heat';
