import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import type { LocalDate } from '../../../core/domain/types';
import { buildPlanView, type PlanView } from '../domain/view';
import { accountRepo, categoryRepo, goalRepo, paymentRepo, prefsRepo, txRepo } from './repo';

export const useAccounts = () => useLiveQuery(() => accountRepo.all(), []);
export const useCategories = () => useLiveQuery(() => categoryRepo.all(), []);
export const useTxs = () => useLiveQuery(() => txRepo.all(), []);
export const usePayments = () => useLiveQuery(() => paymentRepo.all(), []);
export const useGoals = () => useLiveQuery(() => goalRepo.all(), []);
export const usePrefs = () => useLiveQuery(() => prefsRepo.get(), []);

export type { PlanView };

/** Всё, что показывают план и карточка на «Сводке». */
export function usePlan(today: LocalDate): PlanView | undefined {
  const accounts = useAccounts();
  const txs = useTxs();
  const payments = usePayments();
  const prefs = usePrefs();
  return useMemo(() => (accounts && txs && payments && prefs ? buildPlanView(today, accounts, txs, payments, prefs) : undefined), [today, accounts, txs, payments, prefs]);
}
