/*
 * Строка советов: сначала подсказки по данным пользователя, затем общие.
 * Порядок подсказок — от срочного к полезному, поэтому просрочка всегда первая.
 */
import { addDays, addMonths, diffDays } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import type { Due } from './plan';
import { rub, rubUp } from './money';
import { GENERAL_TIPS } from './tipsList';
import type { Category, Kopecks, Tx } from './types';

export const DEFAULT_SAVE_PERCENT = 10;
/** Столько дней после дохода держится совет отложить с него. */
const INCOME_DAYS = 3;
/** Рост категории заметен, только если он большой и в доле, и в рублях. */
const GROWTH_SHARE = 1.3;
const GROWTH_MIN = 1000 * 100;
const EPOCH = '2026-01-01';

export interface TipInput {
  today: LocalDate;
  money: Kopecks;
  living: Kopecks;
  dues: readonly Due[];
  /** Хватает ли денег на все сроки. */
  covered: boolean;
  txs: readonly Tx[];
  categories: readonly Pick<Category, 'id' | 'name'>[];
  savePercent: number;
}

function daysText(n: number): string {
  const tens = n % 100;
  const ones = n % 10;
  const word = tens >= 11 && tens <= 14 ? 'дней' : ones === 1 ? 'день' : ones >= 2 && ones <= 4 ? 'дня' : 'дней';
  return `${String(n)} ${word}`;
}

const whenText = (days: number): string => (days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${daysText(days)}`);

/** Ближайший срок, на который не хватает денег с учётом более ранних платежей и расходов на жизнь. */
function shortage({ today, money, living, dues }: TipInput): string | null {
  let sum = 0;
  for (const due of dues) {
    sum += due.amount;
    if (due.date < today) continue;
    const days = diffDays(due.date, today);
    const need = sum + living * days - money;
    if (need > 0) return `«${due.name}»: ${whenText(days)}, не хватает ${rubUp(need)}.`;
  }
  return null;
}

function saveFromIncome({ today, txs, covered, savePercent }: TipInput): string | null {
  if (!covered || savePercent <= 0) return null;
  const from = addDays(today, -INCOME_DAYS);
  const last = txs.filter((t) => t.kind === 'income' && t.date >= from && t.date <= today).reduce<Tx | null>((a, t) => (a === null || t.date > a.date || (t.date === a.date && t.createdAt > a.createdAt) ? t : a), null);
  if (last === null) return null;
  return `Пришло ${rub(last.amount)}. Если отложить ${String(savePercent)}%, это ${rub(Math.round((last.amount * savePercent) / 100))}.`;
}

/** Обязательные платежи не считаем: их сумма от привычек не зависит. */
function spentByCategory(txs: readonly Tx[], from: LocalDate, to: LocalDate): Map<string, Kopecks> {
  const out = new Map<string, Kopecks>();
  for (const t of txs) {
    if (t.kind !== 'expense' || t.paymentId || !t.categoryId || t.date < from || t.date > to) continue;
    out.set(t.categoryId, (out.get(t.categoryId) ?? 0) + t.amount);
  }
  return out;
}

function growth({ today, txs, categories }: TipInput): string | null {
  const monthStart = `${today.slice(0, 7)}-01`;
  const before = spentByCategory(txs, addMonths(monthStart, -1), addMonths(today, -1));
  let best: { id: string; now: Kopecks; diff: Kopecks } | null = null;
  for (const [id, now] of spentByCategory(txs, monthStart, today)) {
    const was = before.get(id) ?? 0;
    const diff = now - was;
    if (was > 0 && now >= was * GROWTH_SHARE && diff >= GROWTH_MIN && (best === null || diff > best.diff)) best = { id, now, diff };
  }
  const name = categories.find((c) => c.id === best?.id)?.name;
  return best && name ? `«${name}»: ${rub(best.now)} с начала месяца, на ${rub(best.diff)} больше, чем за те же дни прошлого.` : null;
}

/** Каждый день общие советы начинаются с другого места списка. */
function generalFrom(today: LocalDate): string[] {
  const n = GENERAL_TIPS.length;
  const shift = ((diffDays(today, EPOCH) % n) + n) % n;
  return [...GENERAL_TIPS.slice(shift), ...GENERAL_TIPS.slice(0, shift)];
}

export function tips(input: TipInput): string[] {
  const { today, living, dues } = input;
  const overdue = dues.filter((d) => d.date < today).map((d) => `«${d.name}»: срок прошёл, ${rub(d.amount)}.`);
  const unset = living === 0 ? 'Обычные траты пока не в плане, поэтому цель занижена. Записывайте расходы: хватит недели.' : null;
  const personal = [...overdue, unset, shortage(input), saveFromIncome(input), growth(input)].filter((t) => t !== null);
  return [...personal, ...generalFrom(today)];
}
