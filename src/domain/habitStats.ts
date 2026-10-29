import { addDays, rangeDates } from './dates';
import type { LocalDate } from './types';

export interface DayPoint {
  date: LocalDate;
  /** null — за этот день записи нет. */
  value: number | null;
}

/** Значения привычки по каждому дню диапазона [from, to]. */
export function buildSeries(values: ReadonlyMap<LocalDate, number>, from: LocalDate, to: LocalDate): DayPoint[] {
  return rangeDates(from, to).map((date) => ({ date, value: values.get(date) ?? null }));
}

/**
 * Скользящее среднее по записанным дням окна из `window` календарных дней, заканчивающегося
 * в текущей точке. Дни без записи в среднее не входят; null — в окне нет ни одной записи.
 */
export function movingAverage(series: readonly DayPoint[], window = 7): (number | null)[] {
  return series.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - window + 1); k <= i; k++) {
      const v = series[k]?.value;
      if (v !== null && v !== undefined) {
        sum += v;
        n++;
      }
    }
    return n === 0 ? null : sum / n;
  });
}

export interface CountStats {
  entries: number;
  total: number;
  /** Среднее за день с записью, за всё время. */
  average: number | null;
  last7Avg: number | null;
  prev7Avg: number | null;
  best: { date: LocalDate; value: number } | null;
  today: number | null;
}

function avgBetween(values: ReadonlyMap<LocalDate, number>, from: LocalDate, to: LocalDate): number | null {
  let sum = 0;
  let n = 0;
  for (const d of rangeDates(from, to)) {
    const v = values.get(d);
    if (v !== undefined) {
      sum += v;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

export function countStats(values: ReadonlyMap<LocalDate, number>, todayDate: LocalDate): CountStats {
  let total = 0;
  let best: CountStats['best'] = null;
  for (const [date, value] of values) {
    total += value;
    if (!best || value > best.value || (value === best.value && date > best.date)) best = { date, value };
  }
  return {
    entries: values.size,
    total,
    average: values.size === 0 ? null : total / values.size,
    last7Avg: avgBetween(values, addDays(todayDate, -6), todayDate),
    prev7Avg: avgBetween(values, addDays(todayDate, -13), addDays(todayDate, -7)),
    best,
    today: values.get(todayDate) ?? null,
  };
}

/** Число без хвоста из нулей: 12, 2.5, 0.33. */
export function formatValue(n: number): string {
  return String(Number(n.toFixed(2)));
}

const UNITS: readonly { d: number; label: string }[] = [
  { d: 1e3, label: 'тыс' },
  { d: 1e6, label: 'млн' },
  { d: 1e9, label: 'млрд' },
];

export interface CompactParts {
  text: string;
  /** тыс / млн / млрд или пустая строка. */
  suffix: string;
}

/** Число и суффикс отдельно: суффикс на кириллице удобно выводить мелким шрифтом. */
export function compactParts(n: number): CompactParts {
  const abs = Math.abs(n);
  if (abs < 1e4) return { text: formatValue(n), suffix: '' };
  // Самая крупная единица, в которую число «влезает»
  let pick = UNITS.filter((u) => abs >= u.d).pop() ?? UNITS[0];
  let v = Number((n / (pick?.d ?? 1)).toFixed(1));
  const next = UNITS.find((u) => pick && u.d > pick.d);
  // 999.96 тыс округляется до 1000 — берём следующую единицу
  if (Math.abs(v) >= 1000 && next) {
    pick = next;
    v = Number((n / next.d).toFixed(1));
  }
  return { text: String(v), suffix: pick?.label ?? '' };
}

/** Короткая запись больших чисел для осей и подсказок: 12.3 тыс, 4 млн, 1 млрд. */
export function formatCompact(n: number): string {
  const { text, suffix } = compactParts(n);
  return suffix ? `${text} ${suffix}` : text;
}

/** Разбор введённого числа: запятая или точка; null — не число или отрицательное. */
export function parseValue(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
}
