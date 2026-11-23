/*
 * Доходы по датам и два новых режима плана.
 * «Зарплата»: сколько можно тратить в день до следующей выплаты (деньги минус платежи до неё, поделённые на дни).
 * «Когда как»: на сколько дней хватит денег и сколько нужно получить за месяц.
 * Режим «каждый день» остаётся в plan.ts без изменений.
 */
import { addDays, diffDays, weekday } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { occurrences, type Due } from './plan';
import type { Kopecks, Payday, Tx } from './types';

/** Смотрим вперёд на два месяца: следующая выплата всегда в окне, даже при редком повторе. */
const HORIZON_DAYS = 62;
/** Неполученная выплата старше этого считается забытой. */
const OVERDUE_DAYS = 62;
/** Платежи в эти дни после выплаты показываем предупреждением. */
const AFTER_DAYS = 7;
/** Дальше этого «хватит на N дней» не считаем: «больше трёх месяцев». */
const RUNWAY_DAYS = 90;

export interface Expected {
  paydayId: string;
  name: string;
  amount: Kopecks;
  /** Плановая дата по расписанию; по ней выплату отмечают полученной. */
  date: LocalDate;
  /** Когда ждём деньги: плановая дата или пятница, если выпало на выходной. */
  when: LocalDate;
}

/** Выплата на субботу или воскресенье приходит в пятницу (так выплачивают зарплату). */
export function effectiveDate(date: LocalDate, shift: boolean): LocalDate {
  if (!shift) return date;
  const w = weekday(date);
  return w === 5 ? addDays(date, -1) : w === 6 ? addDays(date, -2) : date;
}

const key = (id: string, date: LocalDate) => `${id}|${date}`;

/** Ещё не полученные и не пропущенные выплаты, по дате ожидания; просроченные тоже. */
export function openPaydays(paydays: readonly Payday[], txs: readonly Tx[], today: LocalDate, shift: boolean): Expected[] {
  const received = new Set(txs.filter((t) => t.paydayId && t.dueDate).map((t) => key(t.paydayId ?? '', t.dueDate ?? '')));
  return paydays
    .flatMap((p) =>
      occurrences(p, addDays(today, -OVERDUE_DAYS), addDays(today, HORIZON_DAYS))
        .filter((date) => !received.has(key(p.id, date)) && !p.skipped.includes(date))
        .map((date): Expected => ({ paydayId: p.id, name: p.name, amount: p.amount, date, when: effectiveDate(date, shift) })),
    )
    .sort((a, b) => a.when.localeCompare(b.when));
}

/** Рубли вниз: лимит не должен обещать лишнего. */
const floorRub = (k: Kopecks): Kopecks => Math.max(0, Math.floor(k / 100) * 100);

export interface SalaryInput {
  today: LocalDate;
  /** Деньги на счетах плана сейчас. */
  money: Kopecks;
  /** Открытые сроки обязательных платежей. */
  dues: readonly Due[];
  /** Ожидаемые поступления (openPaydays). */
  expected: readonly Expected[];
  /** Операции сегодняшнего дня по счетам плана. */
  todayTx: readonly Tx[];
}

export type SalaryState = 'ok' | 'short' | 'noPayday';

export interface SalaryPlan {
  state: SalaryState;
  /** Ближайшая выплата в будущем. */
  next?: Expected;
  /** Выплаты, дата которых уже наступила, а деньги не отмечены: в расчёт не входят. */
  waiting: Expected[];
  /** Дней до выплаты, считая сегодняшний. */
  daysLeft: number;
  /** Свободно до выплаты: деньги на начало дня минус платежи до неё. */
  free: Kopecks;
  /** Сколько можно тратить сегодня (от денег на начало дня, поэтому не прыгает от каждой траты). */
  limit: Kopecks;
  /** Потрачено сегодня без обязательных платежей. */
  spent: Kopecks;
  /** Осталось на сегодня; отрицательное — перерасход. */
  left: Kopecks;
  /** Лимит со следующего дня при тех же деньгах; null — завтра выплата. */
  tomorrow: Kopecks | null;
  /** Первый срок, на который не хватает денег, и сколько. */
  short?: { due: Due; need: Kopecks };
  /** Платежи в неделю после выплаты. */
  after: Due[];
  afterSum: Kopecks;
}

/**
 * Остаток переходит на завтра сам: лимит каждый день считается заново от денег на начало дня,
 * поэтому сэкономленное прибавляется к следующим дням, а перерасход — вычитается.
 */
export function salaryPlan({ today, money, dues, expected, todayTx }: SalaryInput): SalaryPlan {
  const next = expected.find((e) => e.when > today);
  const waiting = expected.filter((e) => e.when <= today);
  const spent = todayTx.filter((t) => t.kind === 'expense' && !t.paymentId).reduce((a, t) => a + t.amount, 0);
  if (!next) return { state: 'noPayday', waiting, daysLeft: 0, free: money, limit: 0, spent, left: 0, tomorrow: null, after: [], afterSum: 0 };

  const daysLeft = diffDays(next.when, today);
  const before = dues.filter((d) => d.date < next.when).sort((a, b) => a.date.localeCompare(b.date));
  const dueSum = before.reduce((a, d) => a + d.amount, 0);
  const free = money + spent - dueSum;
  const limit = floorRub(free / daysLeft);

  let short: SalaryPlan['short'];
  let sum = 0;
  for (const due of before) {
    sum += due.amount;
    if (sum > money) {
      short = { due, need: sum - money };
      break;
    }
  }

  const after = dues.filter((d) => d.date >= next.when && d.date <= addDays(next.when, AFTER_DAYS));
  return {
    state: free < 0 ? 'short' : 'ok',
    next,
    waiting,
    daysLeft,
    free,
    limit,
    spent,
    left: limit - spent,
    tomorrow: daysLeft > 1 ? floorRub((money - dueSum) / (daysLeft - 1)) : null,
    ...(short ? { short } : {}),
    after,
    afterSum: after.reduce((a, d) => a + d.amount, 0),
  };
}

export interface IrregularInput {
  today: LocalDate;
  money: Kopecks;
  living: Kopecks;
  dues: readonly Due[];
  todayTx: readonly Tx[];
}

export interface IrregularPlan {
  /** На сколько полных дней хватит денег при обычных тратах и платежах; null — больше трёх месяцев. */
  runway: number | null;
  /** Первый срок, на который денег не хватит. */
  breaksOn?: Due;
  /** Сколько нужно получить за ближайшие 30 дней, чтобы покрыть платежи и обычные траты. */
  needMonth: Kopecks;
  /** Платежи за 30 дней. */
  dues30: Kopecks;
  living: Kopecks;
  spent: Kopecks;
}

export function irregularPlan({ today, money, living, dues, todayTx }: IrregularInput): IrregularPlan {
  const spent = todayTx.filter((t) => t.kind === 'expense' && !t.paymentId).reduce((a, t) => a + t.amount, 0);
  const dues30 = dues.filter((d) => d.date <= addDays(today, 30)).reduce((a, d) => a + d.amount, 0);
  const needMonth = Math.max(0, dues30 + living * 30 - money);
  let bal = money;
  let runway: number | null = null;
  let breaksOn: Due | undefined;
  for (let i = 0; i < RUNWAY_DAYS; i++) {
    const day = addDays(today, i);
    const todays = dues.filter((d) => (i === 0 ? d.date <= day : d.date === day));
    bal -= living + todays.reduce((a, d) => a + d.amount, 0);
    if (bal < 0) {
      runway = i;
      breaksOn = todays.length > 0 ? todays[0] : undefined;
      break;
    }
  }
  return { runway, ...(breaksOn ? { breaksOn } : {}), needMonth, dues30, living, spent };
}

/** Какие сроки покрыты деньгами на счетах прямо сейчас (с учётом более ранних): для подписи «хватает / не хватает». */
export function coveredByMoney(dues: readonly Due[], money: Kopecks): Set<Due> {
  const out = new Set<Due>();
  let sum = 0;
  for (const d of [...dues].sort((a, b) => a.date.localeCompare(b.date))) {
    sum += d.amount;
    if (sum <= money) out.add(d);
  }
  return out;
}
