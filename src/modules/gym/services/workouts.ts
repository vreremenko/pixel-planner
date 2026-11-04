/* Сценарии тренировки: начать, подходы, завершить, удалить. */
import { today } from '../../../core/domain/dates';
import { play } from '../../../core/sfx';
import { IDLE_MS, lastActivity, lastSessionSets } from '../domain/logic';
import type { Program, WorkoutSet } from '../domain/types';
import { setRepo, tables, workoutRepo } from '../data/repo';

/** Начать тренировку: по дню программы (подходы заготовлены, цифры — из прошлого раза или цели) или пустую. */
export async function startWorkout(program?: Program): Promise<string> {
  const active = await workoutRepo.active();
  if (active) return active.id;
  const now = Date.now();
  const w = await workoutRepo.save({ date: today(), startedAt: now, title: program?.name ?? 'Тренировка', ...(program ? { programId: program.id } : {}) });
  if (program) {
    const [sets, workouts] = await Promise.all([setRepo.all(), workoutRepo.all()]);
    let order = 0;
    for (const item of program.items) {
      const last = lastSessionSets(sets, workouts, item.exerciseId, w.id);
      const targetReps = Number.parseInt(item.reps ?? '', 10);
      for (let i = 0; i < item.sets; i++) {
        const prev = last[i] ?? last[last.length - 1];
        await setRepo.save({
          workoutId: w.id,
          exerciseId: item.exerciseId,
          date: w.date,
          order: ++order,
          done: false,
          ...pick(prev, item.weight, Number.isNaN(targetReps) ? undefined : targetReps),
          ...(item.restSec ? { restSec: item.restSec } : {}),
        });
      }
    }
  }
  return w.id;
}

/** Значения подхода: из прошлого раза, иначе цель программы. */
function pick(prev: WorkoutSet | undefined, weight?: number, reps?: number): Partial<WorkoutSet> {
  const out: Partial<WorkoutSet> = {};
  const w = prev?.weight ?? weight;
  const r = prev?.reps ?? reps;
  if (w !== undefined) out.weight = w;
  if (r !== undefined) out.reps = r;
  if (prev?.durationSec !== undefined) out.durationSec = prev.durationSec;
  if (prev?.distanceM !== undefined) out.distanceM = prev.distanceM;
  return out;
}

/** Добавить упражнение в тренировку: первый подход, цифры — из прошлого раза. */
export async function addExercise(workoutId: string, exerciseId: string): Promise<void> {
  const [mine, sets, workouts, w] = await Promise.all([setRepo.byWorkout(workoutId), setRepo.all(), workoutRepo.all(), workoutRepo.get(workoutId)]);
  if (!w) return;
  const last = lastSessionSets(sets, workouts, exerciseId, workoutId);
  await setRepo.save({ workoutId, exerciseId, date: w.date, order: (mine.at(-1)?.order ?? 0) + 1, done: false, ...pick(last[0]) });
}

/** Ещё подход к упражнению — копия последнего. */
export async function addSet(workoutId: string, exerciseId: string): Promise<void> {
  const mine = await setRepo.byWorkout(workoutId);
  const prev = mine.filter((s) => s.exerciseId === exerciseId).at(-1);
  const after = prev?.order ?? mine.at(-1)?.order ?? 0;
  // Сдвигаем порядок следующих упражнений, чтобы новый подход встал сразу за последним
  for (const s of mine) if (s.order > after) await setRepo.save({ ...s, order: s.order + 1 });
  const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, done: _done, rpe: _r, ...copy } = prev ?? ({ workoutId, exerciseId, date: '', order: 0 } as WorkoutSet);
  const w = await workoutRepo.get(workoutId);
  await setRepo.save({ ...copy, workoutId, exerciseId, date: w?.date ?? today(), order: after + 1, done: false });
}

export async function updateSet(s: WorkoutSet, patch: Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'durationSec' | 'distanceM' | 'rpe'>>): Promise<void> {
  await setRepo.save({ ...s, ...patch });
}

export async function toggleSet(s: WorkoutSet, done: boolean): Promise<void> {
  await setRepo.save({ ...s, done });
  play(done ? 'complete' : 'undo');
}

export const removeSet = (id: string) => setRepo.remove(id);

/** Убрать упражнение из тренировки целиком. */
export async function removeExercise(workoutId: string, exerciseId: string): Promise<void> {
  for (const s of await setRepo.byWorkout(workoutId)) if (s.exerciseId === exerciseId) await setRepo.remove(s.id);
}

/** Завершить: невыполненные подходы убираются, чтобы не портить историю. */
export async function finishWorkout(workoutId: string): Promise<void> {
  const w = await workoutRepo.get(workoutId);
  if (!w) return;
  for (const s of await setRepo.byWorkout(workoutId)) if (!s.done) await setRepo.remove(s.id);
  await workoutRepo.save({ ...w, finishedAt: Date.now() });
}

/**
 * Закрыть забытую тренировку: полчаса без действий — считаем, что человек закончил и не нажал «Завершить».
 * Время окончания — последнее действие, а не «сейчас». Если ни одного подхода не отмечено, тренировка просто удаляется.
 * Возвращает закрытую тренировку (для уведомления) или undefined.
 */
export async function autoFinishIdle(now = Date.now()): Promise<{ id: string; title: string; setsDone: number } | undefined> {
  const w = await workoutRepo.active();
  if (!w) return undefined;
  // Берём и удалённые подходы: удаление — тоже действие
  const all = await tables.sets.where('workoutId').equals(w.id).toArray();
  const last = lastActivity(w, all);
  if (now - last < IDLE_MS) return undefined;
  const setsDone = all.filter((s) => !s.deletedAt && s.done).length;
  if (setsDone === 0) {
    await deleteWorkout(w.id);
    return undefined;
  }
  for (const s of await setRepo.byWorkout(w.id)) if (!s.done) await setRepo.remove(s.id);
  await workoutRepo.save({ ...w, finishedAt: last, auto: true });
  return { id: w.id, title: w.title, setsDone };
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  for (const s of await setRepo.byWorkout(workoutId)) await setRepo.remove(s.id);
  await workoutRepo.remove(workoutId);
}
