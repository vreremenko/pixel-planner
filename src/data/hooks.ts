import { useLiveQuery } from 'dexie-react-hooks';
import { buildOccurrences } from '../domain/recurrence';
import { tagCounts, type TagCount } from '../domain/tags';
import type { Habit, HabitLog, LocalDate, Occurrence, Task } from '../domain/types';
import {
  habitLogRepo,
  habitRepo,
  overrideRepo,
  seriesRepo,
  taskRepo,
} from './repo';

/** Экземпляры повторяющихся задач в диапазоне дат. */
export async function loadOccurrences(from: LocalDate, to: LocalDate, todayDate: LocalDate): Promise<Occurrence[]> {
  const [series, overrides] = await Promise.all([seriesRepo.all(), overrideRepo.all()]);
  return buildOccurrences(series, overrides, from, to, todayDate);
}

export function useDay(date: LocalDate, todayDate: LocalDate) {
  return useLiveQuery(
    async () => ({
      tasks: await taskRepo.byDate(date),
      occurrences: await loadOccurrences(date, date, todayDate),
    }),
    [date, todayDate],
  );
}

export function useBacklog(): Task[] | undefined {
  return useLiveQuery(() => taskRepo.backlog(), []);
}

export function useAllTasks(): Task[] | undefined {
  return useLiveQuery(() => taskRepo.all(), []);
}

export function useHabits(): Habit[] | undefined {
  return useLiveQuery(async () => (await habitRepo.all()).sort((a, b) => a.order - b.order), []);
}

export function useHabitLogs(): HabitLog[] | undefined {
  return useLiveQuery(() => habitLogRepo.all(), []);
}

export function useSeries() {
  return useLiveQuery(() => seriesRepo.all(), []);
}

/** Все метки из задач и повторяющихся задач со счётчиком — для подсказок в редакторе. */
export function useTagCounts(): TagCount[] {
  return (
    useLiveQuery(async () => {
      const [tasks, series] = await Promise.all([taskRepo.all(), seriesRepo.all()]);
      return tagCounts([...tasks.map((t) => t.tags), ...series.map((x) => x.tags)]);
    }, []) ?? []
  );
}
