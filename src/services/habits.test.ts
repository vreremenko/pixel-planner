import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { habitLogRepo, habitRepo, stamp } from '../data/repo';
import { completeFromReminder } from '../data/quickActions';
import type { Habit } from '../domain/types';
import { createHabit, setHabitValue } from './habits';

const getHabit = async (): Promise<Habit> => {
  const h = (await habitRepo.all())[0];
  if (!h) throw new Error('нет привычки');
  return h;
};

describe('счётные привычки', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await createHabit({ name: 'Отжимания', icon: 'dumbbell', schedule: { type: 'daily' }, tracking: { kind: 'count', unit: 'раз' } });
  });

  it('значение сохраняется в логе, правка заменяет число', async () => {
    const h = await getHabit();
    await setHabitValue(h, '2026-01-05', 20);
    await setHabitValue(h, '2026-01-05', 35);
    const logs = await habitLogRepo.byHabit(h.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.value).toBe(35);
  });

  it('обнуление значения снимает отметку дня', async () => {
    const h = await getHabit();
    await setHabitValue(h, '2026-01-05', 20);
    expect(await habitLogRepo.isDone(h.id, '2026-01-05')).toBe(true);
    await setHabitValue(h, '2026-01-05', 0);
    expect(await habitLogRepo.isDone(h.id, '2026-01-05')).toBe(false);
  });

  it('«Выполнено» из уведомления не отмечает счётную привычку', async () => {
    const h = await getHabit();
    expect(await completeFromReminder({ kind: 'habit', ref: h.id, date: '2026-01-05' })).toBe(false);
    expect(await habitLogRepo.isDone(h.id, '2026-01-05')).toBe(false);
  });

  it('обычная привычка отмечается из уведомления', async () => {
    await habitRepo.put(stamp({ name: 'Вода', icon: 'drop', schedule: { type: 'daily' }, archived: false, order: 9 } as Habit));
    const plain = (await habitRepo.all()).find((x) => x.name === 'Вода');
    expect(await completeFromReminder({ kind: 'habit', ref: plain?.id ?? '', date: '2026-01-05' })).toBe(true);
    expect(await habitLogRepo.isDone(plain?.id ?? '', '2026-01-05')).toBe(true);
  });
});
