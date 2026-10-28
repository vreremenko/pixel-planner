import type { LocalDate, LocalTime, Weekday } from './types';

/*
 * Вся календарная арифметика идёт через UTC-полночь: так сложение дней
 * никогда не «съезжает» из-за перехода на летнее время.
 */

const DAY_MS = 86_400_000;

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export function parseLocalDate(d: LocalDate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number);
  if (y === undefined || m === undefined || day === undefined) throw new Error(`Bad date: ${d}`);
  return { y, m, day };
}

export function isLocalDate(s: unknown): s is LocalDate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isLocalTime(s: unknown): s is LocalTime {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function toUtcMs(d: LocalDate): number {
  const { y, m, day } = parseLocalDate(d);
  return Date.UTC(y, m - 1, day);
}

function fromUtcMs(ms: number): LocalDate {
  const dt = new Date(ms);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function makeDate(y: number, m: number, day: number): LocalDate {
  return fromUtcMs(Date.UTC(y, m - 1, day));
}

/** Сегодняшняя дата в текущем часовом поясе устройства. */
export function today(now: Date = new Date()): LocalDate {
  return dateOf(now);
}

/** Локальная дата момента времени в текущем часовом поясе. */
export function dateOf(instant: Date): LocalDate {
  return `${pad(instant.getFullYear(), 4)}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
}

export function timeOf(instant: Date): LocalTime {
  return `${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / DAY_MS);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 0 = Пн … 6 = Вс */
export function weekday(d: LocalDate): Weekday {
  const js = new Date(toUtcMs(d)).getUTCDay();
  return ((js + 6) % 7) as Weekday;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function startOfWeek(d: LocalDate): LocalDate {
  return addDays(d, -weekday(d));
}

export function startOfMonth(d: LocalDate): LocalDate {
  const { y, m } = parseLocalDate(d);
  return makeDate(y, m, 1);
}

export function endOfMonth(d: LocalDate): LocalDate {
  const { y, m } = parseLocalDate(d);
  return makeDate(y, m, daysInMonth(y, m));
}

export function addMonths(d: LocalDate, n: number): LocalDate {
  const { y, m, day } = parseLocalDate(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeDate(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

export function rangeDates(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function parseTime(t: LocalTime): { h: number; min: number } {
  const [h, min] = t.split(':').map(Number);
  return { h: h ?? 0, min: min ?? 0 };
}

export function minutesOf(t: LocalTime): number {
  const { h, min } = parseTime(t);
  return h * 60 + min;
}

/**
 * Абсолютный момент для локальных даты и времени в текущем поясе.
 * Несуществующее время (переход вперёд, напр. 02:30) сдвигается вперёд на величину
 * перехода; неоднозначное (переход назад) — берётся первое вхождение.
 */
export function toInstant(d: LocalDate, t: LocalTime): Date {
  const { y, m, day } = parseLocalDate(d);
  const { h, min } = parseTime(t);
  const result = new Date(y, m - 1, day, h, min, 0, 0);
  // Неоднозначное время: проверяем, существует ли такой же «настенный» час на 1 ч раньше по UTC.
  const earlier = new Date(result.getTime() - 3_600_000);
  if (earlier.getHours() === h && earlier.getMinutes() === min && dateOf(earlier) === d) {
    return earlier;
  }
  return result;
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
export const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAYS_FULL = [
  'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
];

export function formatDateLong(d: LocalDate): string {
  const { m, day } = parseLocalDate(d);
  return `${day} ${MONTHS_GEN[m - 1] ?? ''}, ${WEEKDAYS_FULL[weekday(d)] ?? ''}`;
}

export function formatDateShort(d: LocalDate): string {
  const { m, day } = parseLocalDate(d);
  return `${pad(day)}.${pad(m)}`;
}

export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
