/* Всё, что показывают план, карточка «Сводки» и помощник: считается одним местом, чтобы цифры везде совпадали. */
import type { LocalDate } from '../../../core/domain/types';
import { irregularPlan, openPaydays, salaryPlan } from './income';
import { balances, dayPlan, livingTypical, openDues } from './plan';
import { ALL_DAYS, type Account, type FinPrefs, type IncomeMode, type Payment, type Tx } from './types';

export function buildPlanView(today: LocalDate, accounts: readonly Account[], txs: readonly Tx[], payments: readonly Payment[], prefs: Pick<FinPrefs, 'workDays' | 'incomeMode' | 'paydays' | 'shiftWeekend'>) {
  const live = accounts.filter((a) => !a.archived);
  const inPlan = new Set(live.filter((a) => a.inPlan).map((a) => a.id));
  const balance = balances(live, txs);
  const money = [...inPlan].reduce((a, id) => a + (balance.get(id) ?? 0), 0);
  const living = livingTypical(txs, today) ?? 0;
  const work = prefs.workDays ?? ALL_DAYS;
  const dues = openDues(payments, txs, today);
  const todayTx = txs.filter((t) => t.date === today && inPlan.has(t.accountId));
  const netIn = txs
    .filter((t) => t.date === today && t.kind === 'transfer')
    .reduce((a, t) => a + (inPlan.has(t.toAccountId ?? '') ? t.amount : 0) - (inPlan.has(t.accountId) ? t.amount : 0), 0);
  // Нет настройки — «каждый день»: так считали до режимов, у старых пользователей ничего не меняется
  const mode: IncomeMode = prefs.incomeMode ?? 'daily';
  const expected = openPaydays(prefs.paydays ?? [], txs, today, prefs.shiftWeekend !== false);
  return {
    mode,
    balance,
    money,
    living,
    work,
    dues,
    expected,
    plan: dayPlan({ today, money, living, work, dues, todayTx, netIn }),
    salary: salaryPlan({ today, money, dues, expected, todayTx }),
    // «Сколько хватит денег» смотрит на три месяца вперёд, а не на месяц, как остальное: иначе повторяющиеся платежи после первого срока не видны
    irregular: irregularPlan({ today, money, living, dues: openDues(payments, txs, today, 90), todayTx }),
  };
}

export type PlanView = ReturnType<typeof buildPlanView>;
