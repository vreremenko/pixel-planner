import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/data/db';
import { programRepo, setRepo, workoutRepo } from '../data/repo';
import { addExercise, addSet, finishWorkout, startWorkout, toggleSet, updateSet } from './workouts';

describe('сценарии тренировки', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('тренировка по программе: подходы заготовлены, повторная — с весами из прошлого раза', async () => {
    const p = await programRepo.save({ name: 'Грудь', order: 1, items: [{ exerciseId: 'bench-press', sets: 2, reps: '8', weight: 60 }] });
    const w1 = await startWorkout(p);
    const s1 = await setRepo.byWorkout(w1);
    expect(s1.map((x) => [x.weight, x.reps, x.done])).toEqual([[60, 8, false], [60, 8, false]]);
    await updateSet(s1[0]!, { weight: 65, reps: 6 });
    await toggleSet({ ...s1[0]!, weight: 65, reps: 6 }, true);
    await finishWorkout(w1);
    // невыполненный подход убран из истории
    expect(await setRepo.byWorkout(w1)).toHaveLength(1);
    const w2 = await startWorkout(p);
    expect((await setRepo.byWorkout(w2)).map((x) => [x.weight, x.reps])).toEqual([[65, 6], [65, 6]]);
  });

  it('пока идёт тренировка, новая не начинается', async () => {
    const a = await startWorkout();
    expect(await startWorkout()).toBe(a);
    expect((await workoutRepo.all()).length).toBe(1);
  });

  it('подход добавляется сразу за последним подходом упражнения', async () => {
    const w = await startWorkout();
    await addExercise(w, 'squat');
    await addExercise(w, 'bench-press');
    await addSet(w, 'squat');
    expect((await setRepo.byWorkout(w)).map((x) => x.exerciseId)).toEqual(['squat', 'squat', 'bench-press']);
  });
});
