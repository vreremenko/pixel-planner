/* Напоминания тренировок по готовым данным (без базы): сообщение об автоматическом завершении забытой тренировки. */
import type { PlannedReminder } from '../../../core/notifications/types';
import { IDLE_MS, lastActivity } from './logic';
import type { Workout, WorkoutSet } from './types';

function planned(w: Workout, last: number, setsDone: number): PlannedReminder {
  return {
    key: `workout:${w.id}:${String(last)}`,
    kind: 'workout',
    ref: w.id,
    date: w.date,
    fireAt: last + IDLE_MS,
    title: 'Тренировка завершена',
    body: `«${w.title}» закрыта автоматически: полчаса без действий. Подходов записано: ${String(setsDone)}.`,
  };
}

/** `sets` — вместе с удалёнными: удаление подхода тоже действие. */
export function planGym(workouts: readonly Workout[], sets: readonly WorkoutSet[], from: Date, to: Date): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const w of workouts) {
    // Идущая тренировка закроется через полчаса после последнего действия; уже закрытая сама — сообщение ещё нужно показать
    if (w.deletedAt || (w.finishedAt && !w.auto)) continue;
    const all = sets.filter((s) => s.workoutId === w.id);
    const setsDone = all.filter((s) => !s.deletedAt && s.done).length;
    if (setsDone === 0) continue;
    const r = planned(w, w.finishedAt ?? lastActivity(w, all), setsDone);
    if (r.fireAt >= from.getTime() && r.fireAt < to.getTime()) out.push(r);
  }
  return out;
}
