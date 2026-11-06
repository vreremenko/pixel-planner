/* Репозитории тренировок. Таблицы берутся из базы при каждом обращении (см. planner/data/repo.ts). */
import { db } from '../../../core/data/db';
import { alive, removeRow, saveRow, type New } from '../../../core/data/repo';
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

export const exerciseRepo = {
  all: async () => (await tables.exercises.toArray()).filter(alive),
  save: (x: New<CustomExercise>) => saveRow(tables.exercises, x),
  remove: (id: string) => removeRow(tables.exercises, id),
};

export const programRepo = {
  all: async () => (await tables.programs.toArray()).filter(alive).sort((a, b) => a.order - b.order),
  get: async (id: string) => {
    const p = await tables.programs.get(id);
    return alive(p) ? p : undefined;
  },
  save: (x: New<Program>) => saveRow(tables.programs, x),
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
  save: (x: New<Workout>) => saveRow(tables.workouts, x),
  remove: (id: string) => removeRow(tables.workouts, id),
};

export const setRepo = {
  all: async () => (await tables.sets.toArray()).filter(alive),
  byWorkout: async (workoutId: string) => (await tables.sets.where('workoutId').equals(workoutId).toArray()).filter(alive).sort((a, b) => a.order - b.order),
  byExercise: async (exerciseId: string) => (await tables.sets.where('exerciseId').equals(exerciseId).toArray()).filter(alive),
  save: (x: New<WorkoutSet>) => saveRow(tables.sets, x),
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
