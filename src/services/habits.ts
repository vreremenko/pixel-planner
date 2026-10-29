import type { Habit, HabitSchedule, HabitTracking, LocalDate, LocalTime } from '../domain/types';
import { habitLogRepo, habitRepo, stamp } from '../data/repo';
import { habitStreak } from '../domain/streaks';
import { habitXp } from '../domain/xp';
import { awardXp, checkAchievements, revokeXp } from './game';
import { play } from './sfx';
import { today } from '../domain/dates';

export interface HabitDraft {
  name: string;
  icon: string;
  schedule: HabitSchedule;
  tracking: HabitTracking;
  reminderTime?: LocalTime;
}

export async function createHabit(d: HabitDraft): Promise<void> {
  const order = (await habitRepo.all()).reduce((m, h) => Math.max(m, h.order), 0) + 1;
  await habitRepo.put(stamp({ ...d, archived: false, order } as Habit));
  await checkAchievements();
}

export async function updateHabit(h: Habit, d: HabitDraft): Promise<void> {
  const { reminderTime: _r, ...rest } = h;
  await habitRepo.put({ ...rest, ...d });
}

export async function setArchived(h: Habit, archived: boolean): Promise<void> {
  await habitRepo.put({ ...h, archived });
}

export async function deleteHabit(id: string): Promise<void> {
  await habitRepo.remove(id);
}

export async function toggleHabit(h: Habit, date: LocalDate, done: boolean): Promise<void> {
  await habitLogRepo.set(h.id, date, done);
  const ref = `${h.id}:${date}`;
  if (done) {
    const dates = new Set((await habitLogRepo.byHabit(h.id)).map((l) => l.date));
    const { current } = habitStreak(h, dates, today());
    await awardXp('habit', ref, habitXp(current), date);
  } else {
    await revokeXp('habit', ref);
    play('undo');
  }
}

/**
 * Записать значение за день у счётной привычки. Значение > 0 — день выполнен (XP начисляется
 * один раз, повторная правка числа его не дублирует); 0 — запись удаляется и XP отзывается.
 */
export async function setHabitValue(h: Habit, date: LocalDate, value: number): Promise<void> {
  const ref = `${h.id}:${date}`;
  if (value > 0) {
    await habitLogRepo.setValue(h.id, date, value);
    const dates = new Set((await habitLogRepo.byHabit(h.id)).map((l) => l.date));
    const { current } = habitStreak(h, dates, today());
    await awardXp('habit', ref, habitXp(current), date);
  } else {
    await habitLogRepo.set(h.id, date, false);
    await revokeXp('habit', ref);
    play('undo');
  }
}
