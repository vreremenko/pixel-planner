/* Откладывание с дохода: сколько, в какую копилку и что при этом будет с планом. */
import type { LocalDate, Weekday } from '../../../core/domain/types';
import { pace, type Due } from './plan';
import type { Account, FinPrefs, Kopecks, Tx } from './types';

export const saveAmount = (income: Kopecks, percent: number): Kopecks => Math.round((income * percent) / 100);

/** Копилки: живые счета вне плана. */
export const savingAccounts = (accounts: readonly Account[]): Account[] => accounts.filter((a) => !a.archived && !a.inPlan);

/** Копилка по умолчанию: выбранная в настройках, а если её нет — единственная. */
export function defaultSaveAccount(accounts: readonly Account[], prefs: Pick<FinPrefs, 'saveAccountId'>): string | undefined {
  const list = savingAccounts(accounts);
  return list.find((a) => a.id === prefs.saveAccountId)?.id ?? (list.length === 1 ? list[0]?.id : undefined);
}

export interface SaveOffer {
  /** Хватает ли на платежи после откладывания. */
  covered: boolean;
  /** Сколько зарабатывать в день после откладывания. */
  rate: Kopecks;
}

export function saveOffer(money: Kopecks, income: Kopecks, saved: Kopecks, dues: readonly Due[], living: Kopecks, work: readonly Weekday[], today: LocalDate): SaveOffer {
  const { rate } = pace(money + income - saved, dues, living, work, today);
  return { covered: rate === 0, rate };
}

/** Переводы, созданные при записи этого дохода. */
export const linkedSaves = (txs: readonly Tx[], incomeId: string): Tx[] => txs.filter((t) => t.kind === 'transfer' && t.fromTxId === incomeId);

/** Сколько отложено в копилку за месяц даты. */
export const savedInMonth = (txs: readonly Tx[], accountId: string, month: LocalDate): Kopecks =>
  txs.filter((t) => t.fromTxId && t.toAccountId === accountId && t.date.slice(0, 7) === month.slice(0, 7)).reduce((a, t) => a + t.amount, 0);
