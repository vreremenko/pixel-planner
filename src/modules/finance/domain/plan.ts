/*
 * План: сколько нужно зарабатывать в день, чтобы к срокам обязательных платежей хватало денег.
 * Для каждого срока считаем, сколько не хватает с учётом всех более ранних платежей и расходов на жизнь,
 * и делим на рабочие дни до него. Самый тесный срок задаёт темп: при нём успеваются и все остальные.
 */
import { addDays, addMonths, diffDays, weekday } from '../../../core/domain/dates';
import type { LocalDate, Weekday } from '../../../core/domain/types';
import type { Account, Kopecks, Payment, Tx } from './types';

/** Смотрим на месяц вперёд: после оплаты квартиры цель сразу считается от следующего срока, без провала в ноль. */
const HORIZON_DAYS = 31;
/** Старее этого неоплаченный срок считается забытым и в план не идёт. */
const OVERDUE_DAYS = 62;
/** Сколько последних недель смотрим, чтобы понять обычный расход. */
const LIVING_WEEKS = 4;

export interface Due {
  paymentId: string;
  name: string;
  date: LocalDate;
  amount: Kopecks;
  categoryId: string;
}

/** Сроки платежа в [from, to]. Месяцы отсчитываем от первого срока, поэтому 31-е не сползает на 28-е навсегда. */
export function occurrences(p: Pick<Payment, 'date' | 'repeat'>, from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let i = 0; ; i++) {
    const d = p.repeat === 'once' ? p.date : p.repeat === 'week' ? addDays(p.date, i * 7) : addMonths(p.date, p.repeat === 'month' ? i : i * 12);
    if (d > to) break;
    if (d >= from) out.push(d);
    if (p.repeat === 'once') break;
  }
  return out;
}

const dueKey = (paymentId: string, date: LocalDate) => `${paymentId}|${date}`;

/** Неоплаченные и не пропущенные сроки до конца окна, просроченные тоже; по дате. */
export function openDues(payments: readonly Payment[], txs: readonly Tx[], today: LocalDate, days = HORIZON_DAYS): Due[] {
  const paid = new Set(txs.filter((t) => t.paymentId && t.dueDate).map((t) => dueKey(t.paymentId ?? '', t.dueDate ?? '')));
  return payments
    .flatMap((p) =>
      occurrences(p, addDays(today, -OVERDUE_DAYS), addDays(today, days))
        .filter((date) => !paid.has(dueKey(p.id, date)) && !p.skipped.includes(date))
        .map((date) => ({ paymentId: p.id, name: p.name, date, amount: p.amount, categoryId: p.categoryId })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const workDaysBetween = (from: LocalDate, to: LocalDate, work: readonly Weekday[]): number => {
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) if (work.includes(weekday(d))) n++;
  return n;
};

export interface Pace {
  /** Сколько зарабатывать в рабочий день. */
  rate: Kopecks;
  /** Срок, который задаёт темп. */
  tightest?: Due;
  /** Сколько денег лишних при самом тесном сроке; 0, если не хватает. */
  free: Kopecks;
  /** Какие сроки уже покрыты деньгами с учётом расходов на жизнь. */
  covered: ReadonlySet<Due>;
  /** Сколько не хватает на сроки, наступившие к этому дню. */
  shortNow: Kopecks;
}

export function pace(money: Kopecks, dues: readonly Due[], living: Kopecks, work: readonly Weekday[], from: LocalDate): Pace {
  const out: { rate: Kopecks; tightest?: Due; free: Kopecks; shortNow: Kopecks } = { rate: 0, free: money, shortNow: 0 };
  const covered = new Set<Due>();
  let sum = 0;
  for (const due of [...dues].sort((a, b) => a.date.localeCompare(b.date))) {
    sum += due.amount;
    const date = due.date < from ? from : due.date;
    const need = sum + living * diffDays(date, from) - money;
    const rate = need / Math.max(1, workDaysBetween(from, date, work));
    if (rate > out.rate) {
      out.rate = rate;
      out.tightest = due;
    }
    out.free = Math.min(out.free, -need);
    if (need <= 0) covered.add(due);
    else if (date === from) out.shortNow = need;
  }
  return { ...out, free: Math.max(0, out.free), covered };
}

export interface DayPlan extends Pace {
  /** Выходной по настройке: сегодняшней цели нет. */
  dayOff: boolean;
  /** Цель на сегодня и сколько уже заработано. */
  target: Kopecks;
  earned: Kopecks;
  left: Kopecks;
  /** Темп начиная с завтра, уже с учётом сегодняшних денег. */
  next: Kopecks;
}

export interface PlanInput {
  today: LocalDate;
  /** Деньги на счетах плана сейчас. */
  money: Kopecks;
  living: Kopecks;
  work: readonly Weekday[];
  dues: readonly Due[];
  /** Операции сегодняшнего дня по счетам плана. */
  todayTx: readonly Tx[];
  /** Переводы сегодня: сколько пришло на счета плана за вычетом ушедшего с них. */
  netIn?: Kopecks;
}

/**
 * Цель дня считается от денег на его начало, поэтому не прыгает от каждой записи: доход идёт в «заработано»,
 * а траты меняют только темп со следующего дня. Оплата срока сегодня ничего не меняет: денег меньше, но и срока нет.
 */
export function dayPlan({ today, money, living, work, dues, todayTx, netIn = 0 }: PlanInput): DayPlan {
  const total = (list: readonly Tx[]) => list.reduce((a, t) => a + t.amount, 0);
  const expenses = todayTx.filter((t) => t.kind === 'expense');
  const paid = expenses.filter((t) => t.paymentId);
  // Деньги, переведённые в копилку, не заработаны: цель от них не растёт, а «заработано» уменьшается.
  const gained = total(todayTx.filter((t) => t.kind === 'income')) + netIn;
  const earned = Math.max(0, gained);
  const spent = total(expenses) - total(paid);
  const paidNow = paid.map((t): Due => ({ paymentId: t.paymentId ?? '', name: '', date: t.dueDate ?? today, amount: t.amount, categoryId: t.categoryId ?? '' }));
  const morning = pace(money - gained + spent + total(paid), [...dues, ...paidNow], living, work, today);
  const dayOff = !work.includes(weekday(today));
  const target = dayOff ? 0 : morning.rate;
  const now = pace(money, dues, living, work, today);
  const next = pace(money - Math.max(0, living - spent), dues, living, work, addDays(today, 1));
  return { ...now, dayOff, target, earned, left: Math.max(0, target - gained), next: next.rate };
}

/** Серединное значение: разовый всплеск на него не влияет. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Обычный расход в день без обязательных платежей: медиана трат за полные недели перед сегодняшним днём.
 * Дорогая покупка уже вычтена из денег на счетах, поэтому в прогноз будущих трат она попадать не должна.
 * null — ещё нет ни одной полной недели записей.
 */
export function livingTypical(txs: readonly Tx[], today: LocalDate): Kopecks | null {
  const spent = txs.filter((t) => t.kind === 'expense' && !t.paymentId && t.date < today);
  const first = spent.reduce<LocalDate | null>((a, t) => (a === null || t.date < a ? t.date : a), null);
  if (first === null) return null;
  const count = Math.min(LIVING_WEEKS, Math.floor(diffDays(today, first) / 7));
  if (count === 0) return null;
  const weeks = new Array<Kopecks>(count).fill(0);
  for (const t of spent) {
    const week = Math.floor((diffDays(today, t.date) - 1) / 7);
    if (week < count) weeks[week] = (weeks[week] ?? 0) + t.amount;
  }
  return Math.round(median(weeks) / 7);
}

/** Балансы счетов: начальный остаток плюс все операции. */
export function balances(accounts: readonly Account[], txs: readonly Tx[]): Map<string, Kopecks> {
  const out = new Map(accounts.map((a) => [a.id, a.start]));
  const add = (id: string | undefined, v: Kopecks) => {
    if (id !== undefined && out.has(id)) out.set(id, (out.get(id) ?? 0) + v);
  };
  for (const t of txs) {
    add(t.accountId, t.kind === 'income' ? t.amount : -t.amount);
    if (t.kind === 'transfer') add(t.toAccountId, t.amount);
  }
  return out;
}
