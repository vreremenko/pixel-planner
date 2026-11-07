/* Напоминания о платежах: накануне и в день срока, утром. */
import { settingsRepo } from '../../core/data/repo';
import { addDays, dateOf, diffDays, toInstant } from '../../core/domain/dates';
import type { PlannedReminder, ReminderProvider } from '../../core/notifications/types';
import { paymentRepo, txRepo } from './data/repo';
import { rub } from './domain/money';
import { openDues } from './domain/plan';

const HOUR = '10:00';

async function plan(from: Date, to: Date, account = false): Promise<PlannedReminder[]> {
  if (!account && !(await settingsRepo.get()).notificationsEnabled) return [];
  const start = dateOf(from);
  const days = diffDays(dateOf(to), start) + 1;
  const dues = openDues(await paymentRepo.all(), await txRepo.all(), start, days);
  return dues.flatMap((d) =>
    [0, 1].flatMap((before) => {
      const fireAt = toInstant(addDays(d.date, -before), HOUR).getTime();
      if (fireAt < from.getTime() || fireAt >= to.getTime()) return [];
      const r: PlannedReminder = {
        key: `payment:${d.paymentId}:${d.date}:${String(before)}`,
        kind: 'payment',
        ref: d.paymentId,
        date: d.date,
        fireAt,
        title: before ? 'Завтра платёж' : 'Сегодня платёж',
        body: `${d.name}: ${rub(d.amount)}`,
      };
      return [r];
    }),
  );
}

export const financeReminders: ReminderProvider = {
  kinds: ['payment'],
  plan,
  openPath: () => '/finance',
};
