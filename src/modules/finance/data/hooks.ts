import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import type { LocalDate } from '../../../core/domain/types';
import { balances, dayPlan, livingTypical, openDues } from '../domain/plan';
import { ALL_DAYS, type Account, type FinPrefs, type Payment, type Tx } from '../domain/types';
import { accountRepo, categoryRepo, paymentRepo, prefsRepo, txRepo } from './repo';

export const useAccounts = () => useLiveQuery(() => accountRepo.all(), []);
export const useCategories = () => useLiveQuery(() => categoryRepo.all(), []);
export const useTxs = () => useLiveQuery(() => txRepo.all(), []);
export const usePayments = () => useLiveQuery(() => paymentRepo.all(), []);
export const usePrefs = () => useLiveQuery(() => prefsRepo.get(), []);

function buildPlan(today: LocalDate, accounts: Account[], txs: Tx[], payments: Payment[], prefs: FinPrefs) {
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
  return { balance, money, living, work, dues, plan: dayPlan({ today, money, living, work, dues, todayTx, netIn }) };
}

export type PlanView = ReturnType<typeof buildPlan>;

/** Всё, что показывают план и карточка на «Сводке». */
export function usePlan(today: LocalDate): PlanView | undefined {
  const accounts = useAccounts();
  const txs = useTxs();
  const payments = usePayments();
  const prefs = usePrefs();
  return useMemo(() => (accounts && txs && payments && prefs ? buildPlan(today, accounts, txs, payments, prefs) : undefined), [today, accounts, txs, payments, prefs]);
}
