/* Напоминания планировщика: задачи, повторы, привычки и утренняя сводка. Расчёт — в domain/reminderPlan.ts. */
import { settingsRepo } from '../../core/data/repo';
import type { PlannedReminder, ReminderProvider } from '../../core/notifications/types';
import { planPlanner, plannerWindow } from './domain/reminderPlan';
import { habitLogRepo, habitRepo, overrideRepo, seriesRepo, taskRepo } from './data/repo';
import { completeFromReminder } from './data/quickActions';

async function plan(from: Date, to: Date, account = false): Promise<PlannedReminder[]> {
  const stored = await settingsRepo.get();
  // Выключатель уведомлений — настройка этого устройства, расписание аккаунта от него не зависит
  const settings = account ? { ...stored, notificationsEnabled: true } : stored;
  const { fromDate, toDate, taskTo } = plannerWindow(from, to);
  const [tasks, series, overrides, habits, habitLogs] = await Promise.all([
    taskRepo.byDateRange(fromDate, taskTo),
    seriesRepo.all(),
    overrideRepo.all(),
    habitRepo.all(),
    habitLogRepo.byDateRange(fromDate, toDate),
  ]);
  return planPlanner({ tasks, series, overrides, habits, habitLogs }, settings, from, to);
}

export const plannerReminders: ReminderProvider = {
  kinds: ['task', 'occurrence', 'habit', 'summary'],
  plan,
  complete: completeFromReminder,
  // Счётной привычке нужно число — его вводят на экране привычек
  openPath: () => '/habits',
};
