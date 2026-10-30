import type { LocalDate } from './types';

/** Значение ряда за день (для графиков). */
export interface DayPoint {
  date: LocalDate;
  /** null — за этот день записи нет. */
  value: number | null;
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
