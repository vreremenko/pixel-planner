import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/data/db';
import { programRepo, setRepo, workoutRepo } from '../data/repo';
import { gymReminders } from '../reminders';
import { addExercise, addSet, autoFinishIdle, finishWorkout, startWorkout, toggleSet, updateSet } from './workouts';

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

  describe('забытая тренировка', () => {
    const MIN = 60_000;
    const begin = async () => {
      const id = await startWorkout();
      await addExercise(id, 'squat');
      const sets = await setRepo.byWorkout(id);
      await toggleSet(sets[0]!, true);
      return { id, last: (await setRepo.byWorkout(id))[0]!.updatedAt };
    };

    it('до получаса не трогается, после — закрывается временем последнего действия', async () => {
      const { id, last } = await begin();
      expect(await autoFinishIdle(last + 29 * MIN)).toBeUndefined();
      expect((await workoutRepo.get(id))?.finishedAt).toBeUndefined();
      expect(await autoFinishIdle(last + 31 * MIN)).toMatchObject({ id, setsDone: 1 });
      expect(await workoutRepo.get(id)).toMatchObject({ finishedAt: last, auto: true });
    });

    it('пустая тренировка (ни одного отмеченного подхода) просто удаляется', async () => {
      const id = await startWorkout();
      await addExercise(id, 'squat');
      expect(await autoFinishIdle(Date.now() + 40 * MIN)).toBeUndefined();
      expect(await workoutRepo.all()).toHaveLength(0);
    });

    it('напоминание: на момент last+30 мин, и после автозавершения тоже', async () => {
      await db.table('settings').put({ id: 'settings', notificationsEnabled: true });
      const { last } = await begin();
      const at = new Date(last + 30 * MIN);
      const before = await gymReminders.plan(new Date(last), new Date(at.getTime() + 1));
      expect(before).toHaveLength(1);
      expect(before[0]).toMatchObject({ kind: 'workout', fireAt: at.getTime(), title: 'Тренировка завершена' });
      await autoFinishIdle(last + 31 * MIN);
      expect(await gymReminders.plan(new Date(last), new Date(at.getTime() + 1))).toEqual(before);
    });
  });
});
