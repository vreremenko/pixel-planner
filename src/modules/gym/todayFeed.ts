/* Тренировки в «Сегодня»: что по программе на сегодня и идущая тренировка. */
import type { LocalDate } from '../../core/domain/types';
import type { TodayFeed, TodayItem } from '../../core/module';
import { programRepo, workoutRepo } from './data/repo';
import { scheduleFor } from './domain/logic';

export async function loadToday(today: LocalDate): Promise<TodayFeed> {
  const [programs, workouts] = await Promise.all([programRepo.all(), workoutRepo.all()]);
  const base = { icon: 'dumbbell', accent: 'var(--c-gym)' } as const;
  const active = workouts.find((w) => !w.finishedAt);
  const { due, done } = scheduleFor(programs, workouts, today);
  const items: TodayItem[] = [
    ...(active ? [{ ...base, id: `gym:active:${active.id}`, title: `Идёт тренировка: ${active.title}`, done: false, to: `/gym/workout/${active.id}`, detail: 'продолжить' } satisfies TodayItem] : []),
    ...due.filter((p) => !active || active.programId !== p.id).map((p): TodayItem => ({ ...base, id: `gym:${p.id}`, title: `Тренировка: ${p.name}`, done: false, to: '/gym', detail: 'по программе' })),
    ...done.map((p): TodayItem => ({ ...base, id: `gym:${p.id}:done`, title: `Тренировка: ${p.name}`, done: true, to: '/gym' })),
  ];
  return { items };
}
