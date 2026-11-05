/* Статистика: итоги месяца, разбивка по категориям, последние месяцы. */
import { MONTHS, addMonths, parseLocalDate, startOfMonth } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import type { CategoryKind, Kopecks, Tx } from './types';

export const monthLabel = (d: LocalDate): string => {
  const { y, m } = parseLocalDate(d);
  return `${MONTHS[m - 1] ?? ''} ${String(y)}`;
};

export const inMonth = (t: Pick<Tx, 'date'>, month: LocalDate): boolean => t.date.slice(0, 7) === month.slice(0, 7);

export function totals(txs: readonly Tx[]): { income: Kopecks; expense: Kopecks } {
  const sum = (kind: CategoryKind) => txs.filter((t) => t.kind === kind).reduce((a, t) => a + t.amount, 0);
  return { income: sum('income'), expense: sum('expense') };
}

export interface CategoryShare {
  categoryId: string;
  sum: Kopecks;
  share: number;
}

export function byCategory(txs: readonly Tx[], kind: CategoryKind): CategoryShare[] {
  const sums = new Map<string, Kopecks>();
  for (const t of txs) if (t.kind === kind) sums.set(t.categoryId ?? '', (sums.get(t.categoryId ?? '') ?? 0) + t.amount);
  const all = [...sums.values()].reduce((a, v) => a + v, 0);
  return [...sums].map(([categoryId, sum]) => ({ categoryId, sum, share: sum / all })).sort((a, b) => b.sum - a.sum);
}

/** Месяцы по порядку, заканчивая указанным. */
export function lastMonths(month: LocalDate, n: number): LocalDate[] {
  const first = startOfMonth(month);
  return Array.from({ length: n }, (_, i) => addMonths(first, i - n + 1));
}

/** Категории в порядке частоты: нужная чаще всего оказывается первой плиткой. */
export function byUse(txs: readonly Tx[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of txs) if (t.categoryId) out.set(t.categoryId, (out.get(t.categoryId) ?? 0) + 1);
  return out;
}
