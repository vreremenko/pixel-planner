/* Напоминания о платежах: накануне и в день срока, утром. Расчёт — в domain/reminderPlan.ts. */
import { settingsRepo } from '../../core/data/repo';
import type { PlannedReminder, ReminderProvider } from '../../core/notifications/types';
import { paymentRepo, txRepo } from './data/repo';
import { planFinance } from './domain/reminderPlan';

async function plan(from: Date, to: Date, account = false): Promise<PlannedReminder[]> {
  if (!account && !(await settingsRepo.get()).notificationsEnabled) return [];
  return planFinance(await paymentRepo.all(), await txRepo.all(), from, to);
}

export const financeReminders: ReminderProvider = {
  kinds: ['payment'],
  plan,
  openPath: () => '/finance',
};
