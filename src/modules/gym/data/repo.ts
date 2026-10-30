/* Репозитории тренировок. Таблицы берутся из базы при каждом обращении (см. planner/data/repo.ts). */
import { db } from '../../../core/data/db';
import { alive, stamp } from '../../../core/data/repo';
import type { SyncMeta } from '../../../core/domain/types';
import { DEFAULT_PREFS, type CustomExercise, type GymPrefs, type Program, type Workout, type WorkoutSet } from '../domain/types';

export const tables = {
  get exercises() {
    return db.table<CustomExercise, string>('gym_exercises');
  },
  get programs() {
    return db.table<Program, string>('gym_programs');
  },
  get workouts() {
    return db.table<Workout, string>('gym_workouts');
  },
  get sets() {
    return db.table<WorkoutSet, string>('gym_sets');
  },
  get prefs() {
    return db.table<GymPrefs, string>('gym_prefs');
  },
};

/** Записать с отметкой времени (новый id, если нет). */
const save = async <T extends SyncMeta>(t: { put: (x: T) => Promise<unknown> }, x: Omit<T, keyof SyncMeta> & Partial<SyncMeta>): Promise<T> => {
  const row = stamp(x) as T;
  await t.put(row);
  return row;
};

/** Мягкое удаление: tombstone синхронизируется на другие устройства. */
const removeRow = async (t: { update: (id: string, c: object) => Promise<unknown> }, id: string) => {
  const now = Date.now();
  await t.update(id, { deletedAt: now, updatedAt: now });
};

export const exerciseRepo = {
  all: async () => (await tables.exercises.toArray()).filter(alive),
  save: (x: Omit<CustomExercise, keyof SyncMeta> & Partial<SyncMeta>) => save<CustomExercise>(tables.exercises, x),
  remove: (id: string) => removeRow(tables.exercises, id),
};

export const programRepo = {
  all: async () => (await tables.programs.toArray()).filter(alive).sort((a, b) => a.order - b.order),
  get: async (id: string) => {
    const p = await tables.programs.get(id);
    return alive(p) ? p : undefined;
  },
  save: (x: Omit<Program, keyof SyncMeta> & Partial<SyncMeta>) => save<Program>(tables.programs, x),
  remove: (id: string) => removeRow(tables.programs, id),
};

export const workoutRepo = {
  all: async () => (await tables.workouts.toArray()).filter(alive),
  get: async (id: string) => {
    const w = await tables.workouts.get(id);
    return alive(w) ? w : undefined;
  },
  /** Идущая тренировка (начата и не завершена), самая свежая. */
  active: async () => (await workoutRepo.all()).filter((w) => !w.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0],
  save: (x: Omit<Workout, keyof SyncMeta> & Partial<SyncMeta>) => save<Workout>(tables.workouts, x),
  remove: (id: string) => removeRow(tables.workouts, id),
};

export const setRepo = {
  all: async () => (await tables.sets.toArray()).filter(alive),
  byWorkout: async (workoutId: string) => (await tables.sets.where('workoutId').equals(workoutId).toArray()).filter(alive).sort((a, b) => a.order - b.order),
  byExercise: async (exerciseId: string) => (await tables.sets.where('exerciseId').equals(exerciseId).toArray()).filter(alive),
  save: (x: Omit<WorkoutSet, keyof SyncMeta> & Partial<SyncMeta>) => save<WorkoutSet>(tables.sets, x),
  remove: (id: string) => removeRow(tables.sets, id),
};

export const prefsRepo = {
  get: async (): Promise<GymPrefs> => {
    const p = await tables.prefs.get('prefs');
    return { id: 'prefs', createdAt: 0, updatedAt: 0, ...DEFAULT_PREFS, ...(alive(p) ? p : {}) };
  },
  patch: async (p: Partial<Omit<GymPrefs, keyof SyncMeta>>) => {
    const cur = await prefsRepo.get();
    await tables.prefs.put({ ...cur, ...p, updatedAt: Date.now() });
  },
};
