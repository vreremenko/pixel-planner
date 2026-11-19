/* Напоминания тренировок: сообщение об автоматическом завершении забытой тренировки. Расчёт — в domain/reminderPlan.ts. */
import { settingsRepo } from '../../core/data/repo';
import type { PlannedReminder, ReminderProvider } from '../../core/notifications/types';
import { planGym } from './domain/reminderPlan';
import { tables, workoutRepo } from './data/repo';

async function plan(from: Date, to: Date, account = false): Promise<PlannedReminder[]> {
  if (!account && !(await settingsRepo.get()).notificationsEnabled) return [];
  const workouts = (await workoutRepo.all()).filter((w) => !w.finishedAt || w.auto);
  // Подходы вместе с удалёнными: удаление — тоже действие
  const sets = workouts.length ? await tables.sets.where('workoutId').anyOf(workouts.map((w) => w.id)).toArray() : [];
  return planGym(workouts, sets, from, to);
}

export const gymReminders: ReminderProvider = {
  kinds: ['workout'],
  plan,
  openPath: () => '/gym',
};
