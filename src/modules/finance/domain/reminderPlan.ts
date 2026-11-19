/* Напоминания о платежах по готовым данным (без базы): накануне и в день срока, утром. */
import { addDays, dateOf, diffDays, toInstant } from '../../../core/domain/dates';
import type { PlannedReminder } from '../../../core/notifications/types';
import { rub } from './money';
import { openDues } from './plan';
import type { Payment, Tx } from './types';

const HOUR = '10:00';

export function planFinance(payments: readonly Payment[], txs: readonly Tx[], from: Date, to: Date): PlannedReminder[] {
  const start = dateOf(from);
  const days = diffDays(dateOf(to), start) + 1;
  return openDues([...payments], [...txs], start, days).flatMap((d) =>
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
