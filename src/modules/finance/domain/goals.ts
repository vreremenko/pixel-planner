/*
 * Цели: накопить сумму к дате. Деньги лежат на отдельном счёте вне плана, поэтому прогресс — это его баланс,
 * а платежи считаются сами по себе. Перевод в копилку уменьшает деньги плана так же, как откладывание с дохода.
 */
import { weekday } from '../../../core/domain/dates';
import type { LocalDate, Weekday } from '../../../core/domain/types';
import { workDaysBetween } from './plan';
import type { Goal, Kopecks, Tx } from './types';

/** Отставание меньше рубля не считаем: это округление. */
const BEHIND_MIN: Kopecks = 100;

export type GoalStatus = 'done' | 'late' | 'behind' | 'ontrack';

export interface GoalView {
  saved: Kopecks;
  status: GoalStatus;
  /** Сколько не хватает до равномерного графика. */
  behind: Kopecks;
  /** Сумма на сегодня: считается на утро и в течение дня не меняется. */
  perDay: Kopecks;
  /** Сколько из неё ещё отложить. */
  todayLeft: Kopecks;
}

/** На сколько сегодня изменился счёт. */
export function movedToday(txs: readonly Tx[], accountId: string, today: LocalDate): Kopecks {
  return txs
    .filter((t) => t.date === today)
    .reduce((sum, t) => {
      if (t.kind === 'transfer') return sum + (t.toAccountId === accountId ? t.amount : 0) - (t.accountId === accountId ? t.amount : 0);
      if (t.accountId !== accountId) return sum;
      return sum + (t.kind === 'income' ? t.amount : -t.amount);
    }, 0);
}

export function goalView(goal: Goal, saved: Kopecks, moved: Kopecks, work: readonly Weekday[], today: LocalDate): GoalView {
  const none = { saved, behind: 0, perDay: 0, todayLeft: 0 };
  if (saved >= goal.amount) return { ...none, status: 'done' };
  if (goal.date <= today) return { ...none, status: 'late' };
  const morningLeft = Math.max(0, goal.amount - (saved - moved));
  const perDay = work.includes(weekday(today)) ? morningLeft / Math.max(1, workDaysBetween(today, goal.date, work)) : 0;
  const total = workDaysBetween(goal.startDate, goal.date, work);
  const passed = Math.min(total, workDaysBetween(goal.startDate, today, work));
  const expected = total > 0 ? goal.startSaved + ((goal.amount - goal.startSaved) * passed) / total : goal.amount;
  const behind = Math.max(0, Math.round(expected - saved));
  return { saved, status: behind >= BEHIND_MIN ? 'behind' : 'ontrack', behind, perDay, todayLeft: Math.max(0, perDay - moved) };
}

export type GoalFields = Pick<Goal, 'name' | 'amount' | 'date' | 'accountId'> & { paused: boolean };

/** Запись после правки. Новая сумма, дата, счёт или конец паузы начинают график заново, иначе цель сразу покраснеет. */
export function applyGoal(old: Goal | null, { paused, ...fields }: GoalFields, saved: Kopecks, today: LocalDate) {
  const flag = paused ? { paused: true } : {};
  if (!old) return { ...fields, startDate: today, startSaved: saved, ...flag };
  const restart = old.amount !== fields.amount || old.date !== fields.date || old.accountId !== fields.accountId || (old.paused === true && !paused);
  const { paused: _old, ...rest } = old;
  return { ...rest, ...fields, startDate: restart ? today : old.startDate, startSaved: restart ? saved : old.startSaved, ...flag };
}
