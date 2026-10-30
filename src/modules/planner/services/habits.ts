import type { LocalDate, LocalTime } from '../../../core/domain/types';
import type { Habit, HabitSchedule, HabitTracking } from '../domain/types';
import { stamp } from '../../../core/data/repo';
import { habitLogRepo, habitRepo } from '../data/repo';
import { play } from '../../../core/sfx';

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
  play(done ? 'complete' : 'undo');
}

/** Записать значение за день у счётной привычки. Значение > 0 — день выполнен; 0 — запись удаляется. */
export async function setHabitValue(h: Habit, date: LocalDate, value: number): Promise<void> {
  if (value > 0) {
    const first = !(await habitLogRepo.byHabit(h.id)).some((l) => l.date === date);
    await habitLogRepo.setValue(h.id, date, value);
    if (first) play('complete');
  } else {
    await habitLogRepo.set(h.id, date, false);
    play('undo');
  }
}
