import { addDays, addMonths, daysInMonth, makeDate, parseLocalDate, weekday } from '../../../core/domain/dates';
import { normalizeTag } from './tags';
import { REMINDER_CHOICES } from './types';
import type { LocalDate, LocalTime } from '../../../core/domain/types';
import type { Priority, RecurrenceEnd, RecurrencePattern, ReminderOffset, Weekday } from './types';

/*
 * Разбор строки быстрого ввода: «Позвонить маме завтра в 15:00 #семья !».
 * Распознаётся: дата, время, приоритет, метки, повтор и напоминание. Всё распознанное вырезается
 * из названия. Чистая функция — «сегодня» передаётся снаружи, чтобы её можно было тестировать.
 */

export type QuickKind = 'repeat' | 'reminder' | 'date' | 'time' | 'priority';

export interface QuickParsed {
  title: string;
  date?: LocalDate;
  time?: LocalTime;
  priority?: Priority;
  tags: string[];
  reminder?: ReminderOffset;
  repeat?: { pattern: RecurrencePattern; end: RecurrenceEnd };
  /** Что распознано (для подсветки и возможности отключить). */
  found: QuickKind[];
}

// \b не работает с кириллицей, поэтому границы слов — через lookaround по буквам и цифрам
const NB = '(?<![\\p{L}\\p{N}])'; // слева не буква/цифра
const NA = '(?![\\p{L}\\p{N}])'; // справа не буква/цифра
const re = (src: string) => new RegExp(src, 'giu');

const WD = '(понедельник|вторник|сред[ауы]|четверг|пятниц[ауы]|суббот[ауы]|воскресенье)';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function weekdayOf(word: string): Weekday {
  const w = word.toLowerCase();
  if (w.startsWith('понедельн')) return 0;
  if (w.startsWith('вторн')) return 1;
  if (w.startsWith('сред')) return 2;
  if (w.startsWith('четв')) return 3;
  if (w.startsWith('пятн')) return 4;
  if (w.startsWith('суббот')) return 5;
  return 6;
}

const validYmd = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);

/** Ближайшая будущая дата с таким днём и месяцем (если в этом году уже прошла — следующий год). */
function upcoming(todayDate: LocalDate, m: number, d: number, year?: number): LocalDate | null {
  const cur = parseLocalDate(todayDate).y;
  if (year !== undefined) return validYmd(year, m, d) ? makeDate(year, m, d) : null;
  if (!validYmd(cur, m, d)) return null;
  const thisYear = makeDate(cur, m, d);
  if (thisYear >= todayDate) return thisYear;
  return validYmd(cur + 1, m, d) ? makeDate(cur + 1, m, d) : null;
}

const PRIORITY_WORDS: Record<string, Priority> = {
  '!': 'high', '!!': 'high', '!высокий': 'high', '!важно': 'high', '!срочно': 'high',
  '!средний': 'medium', '!низкий': 'low', '!неважно': 'low',
};

/** Название без вырезанных кусков: лишние пробелы и знаки по краям убираем. */
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '');


type RepeatSpec =
  | { type: 'daily' }
  | { type: 'weekdays' }
  | { type: 'weekday'; day: Weekday }
  | { type: 'interval'; n: number }
  | { type: 'weekly' }
  | { type: 'monthly' };

export function parseQuickAdd(input: string, todayDate: LocalDate, ignore: ReadonlySet<QuickKind> = new Set()): QuickParsed {
  let work = input;
  const found = new Set<QuickKind>();
  const skip = (k: QuickKind) => ignore.has(k);

  /** Первое подходящее совпадение: вырезает его из рабочей строки и возвращает. */
  const grab = (pattern: RegExp, accept?: (m: RegExpMatchArray) => boolean): RegExpMatchArray | null => {
    for (const m of work.matchAll(pattern)) {
      if (accept && !accept(m)) continue;
      const at = m.index;
      work = work.slice(0, at) + ' ' + work.slice(at + m[0].length);
      return m;
    }
    return null;
  };

  // 1. Повтор (раньше даты: «каждый понедельник» — это не дата)
  let repeatSpec: RepeatSpec | null = null;
  if (!skip('repeat')) {
    let m: RegExpMatchArray | null;
    if (grab(re(`${NB}(каждый\\s+день|ежедневно)${NA}`))) repeatSpec = { type: 'daily' };
    else if (grab(re(`${NB}(по\\s+будням|в\\s+будни|каждый\\s+будний\\s+день)${NA}`))) repeatSpec = { type: 'weekdays' };
    else if ((m = grab(re(`${NB}кажд(?:ый|ую|ое)\\s+${WD}${NA}`)))) repeatSpec = { type: 'weekday', day: weekdayOf(m[1] ?? '') };
    else if ((m = grab(re(`${NB}кажд(?:ые|ый)\\s+(\\d{1,3})\\s*(?:дн(?:я|ей)|день)${NA}`), (x) => Number(x[1]) >= 1))) {
      const n = Number(m[1]);
      repeatSpec = n === 1 ? { type: 'daily' } : { type: 'interval', n };
    } else if (grab(re(`${NB}(каждую\\s+неделю|еженедельно)${NA}`))) repeatSpec = { type: 'weekly' };
    else if (grab(re(`${NB}(каждый\\s+месяц|ежемесячно)${NA}`))) repeatSpec = { type: 'monthly' };
    if (repeatSpec) found.add('repeat');
  }

  // 2. Напоминание: «напомни за 30 минут», «напомнить за час», «напомни за день» (только с «за», иначе это обычное слово)
  let reminder: ReminderOffset | undefined;
  if (!skip('reminder')) {
    const minutesOf = (x: RegExpMatchArray): number | null => {
      if (x[4]) return 1440;
      if (x[3]) return 60;
      const n = Number(x[1]);
      if (!Number.isFinite(n)) return null;
      const unit = (x[2] ?? '').toLowerCase();
      return unit.startsWith('ч') ? n * 60 : n;
    };
    const ok = (x: RegExpMatchArray) => (REMINDER_CHOICES as readonly number[]).includes(minutesOf(x) ?? -1);
    const m = grab(re(`${NB}напомни(?:ть)?\\s+за\\s+(?:(\\d{1,3})\\s*(мин[\\p{L}]*|ч[\\p{L}]*)?|(час)|(день|сутки))${NA}`), ok);
    if (m) {
      reminder = minutesOf(m) as ReminderOffset;
      found.add('reminder');
    }
  }

  // 3. Дата
  let date: LocalDate | undefined;
  if (!skip('date')) {
    let m: RegExpMatchArray | null;
    // «15 ноября», «15 ноября 2027»
    if ((m = grab(re(`${NB}(?:на\\s+)?(\\d{1,2})\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?${NA}`), (x) => upcoming(todayDate, MONTHS.indexOf((x[2] ?? '').toLowerCase()) + 1, Number(x[1]), x[3] ? Number(x[3]) : undefined) !== null))) {
      date = upcoming(todayDate, MONTHS.indexOf((m[2] ?? '').toLowerCase()) + 1, Number(m[1]), m[3] ? Number(m[3]) : undefined) ?? undefined;
    }
    // «15.11», «15.11.2027» (месяц из двух цифр, чтобы «1.5 кг» не стало датой)
    else if ((m = grab(re(`(?<![\\p{L}\\p{N}.:])(\\d{1,2})\\.(\\d{2})(?:\\.(\\d{2,4}))?(?![\\p{L}\\p{N}.:])`), (x) => {
      const y = x[3] ? (x[3].length === 2 ? 2000 + Number(x[3]) : Number(x[3])) : undefined;
      return upcoming(todayDate, Number(x[2]), Number(x[1]), y) !== null;
    }))) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
      date = upcoming(todayDate, Number(m[2]), Number(m[1]), y) ?? undefined;
    }
    // «сегодня», «завтра», «послезавтра»
    else if ((m = grab(re(`${NB}(?:на\\s+)?(послезавтра|завтра|сегодня)${NA}`)))) {
      const w = (m[1] ?? '').toLowerCase();
      date = addDays(todayDate, w === 'сегодня' ? 0 : w === 'завтра' ? 1 : 2);
    }
    // «через 3 дня», «через неделю», «через 2 недели», «через месяц»
    else if ((m = grab(re(`${NB}через\\s+(?:(\\d{1,3})\\s*)?(дн[\\p{L}]*|нед[\\p{L}]*|месяц[\\p{L}]*)${NA}`), (x) => x[1] !== undefined || !(x[2] ?? '').toLowerCase().startsWith('дн')))) {
      const n = m[1] !== undefined ? Number(m[1]) : 1;
      const unit = (m[2] ?? '').toLowerCase();
      date = unit.startsWith('дн') ? addDays(todayDate, n) : unit.startsWith('нед') ? addDays(todayDate, n * 7) : addMonths(todayDate, n);
    }
    // «в пятницу», «во вторник», «в среду»
    else if ((m = grab(re(`${NB}(?:(?:в|во|на)\\s+)?${WD}${NA}`)))) {
      const delta = (weekdayOf(m[1] ?? '') - weekday(todayDate) + 7) % 7;
      date = addDays(todayDate, delta === 0 ? 7 : delta);
    }
    if (date) found.add('date');
  }

  // 4. Время (после даты, чтобы «в 9 завтра» тоже читалось)
  let time: LocalTime | undefined;
  if (!skip('time')) {
    const withPart = (h: number, part: string | undefined): number => {
      switch ((part ?? '').toLowerCase()) {
        case 'дня':
        case 'вечера':
          return h < 12 ? h + 12 : h;
        case 'ночи':
          return h === 12 ? 0 : h >= 9 && h < 12 ? h + 12 : h;
        default:
          return h;
      }
    };
    const fmt = (h: number, min: number) => `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    let m: RegExpMatchArray | null;
    // «15:00», «в 9:30», «в 7:30 вечера»
    if ((m = grab(re(`(?:${NB}(?:в|к)\\s+)?(?<![\\p{L}\\p{N}:])(\\d{1,2}):(\\d{2})(?:\\s*(утра|дня|вечера|ночи))?(?![\\p{L}\\p{N}:])`), (x) => Number(x[1]) < 24 && Number(x[2]) < 60))) {
      time = fmt(withPart(Number(m[1]), m[3]), Number(m[2]));
    }
    // «в 9 утра», «в 7 вечера»
    else if ((m = grab(re(`${NB}в\\s+(\\d{1,2})\\s*(утра|дня|вечера|ночи)${NA}`), (x) => Number(x[1]) >= 1 && Number(x[1]) <= 12))) {
      time = fmt(withPart(Number(m[1]), m[2]), 0);
    }
    // «в 9» — только в конце или перед меткой/приоритетом/знаком, чтобы «в 5 магазинах» не превращалось во время
    else if ((m = grab(re(`${NB}в\\s+(\\d{1,2})(?=\\s*(?:$|[#!,.;]))`), (x) => Number(x[1]) <= 23))) {
      time = fmt(Number(m[1]), 0);
    }
    if (time) found.add('time');
  }

  // Напоминание «за N минут» имеет смысл только со временем; иначе это просто часть названия
  if (reminder !== undefined && time === undefined) {
    return parseQuickAdd(input, todayDate, new Set<QuickKind>([...ignore, 'reminder']));
  }

  // 5. Приоритет: «!», «!!», «!высокий», «!низкий»
  let priority: Priority | undefined;
  if (!skip('priority')) {
    const m = grab(re(`(?<!\\S)(!{1,2}|!высокий|!важно|!срочно|!средний|!низкий|!неважно)(?!\\S)`));
    if (m) {
      priority = PRIORITY_WORDS[(m[1] ?? '').toLowerCase()];
      found.add('priority');
    }
  }

  // 6. Метки #слово (всегда)
  const tags: string[] = [];
  for (const m of work.matchAll(/(?<!\S)#([\p{L}\p{N}_-]+)/gu)) {
    const t = normalizeTag(m[1] ?? '');
    if (t && !tags.includes(t)) tags.push(t);
  }
  work = work.replace(/(?<!\S)#[\p{L}\p{N}_-]+/gu, ' ');

  const title = tidy(work);
  // Если после разбора названия не осталось («завтра» одним словом), считаем введённое обычным текстом
  if (title === '') return { title: tidy(input), tags: [], found: [] };

  const out: QuickParsed = { title, tags, found: [...found] };
  if (date) out.date = date;
  if (time) out.time = time;
  if (priority) out.priority = priority;
  if (reminder !== undefined) out.reminder = reminder;

  if (repeatSpec) {
    const start = date ?? todayDate;
    const never: RecurrenceEnd = { type: 'never' };
    const pattern: RecurrencePattern =
      repeatSpec.type === 'daily' ? { freq: 'daily' }
      : repeatSpec.type === 'weekdays' ? { freq: 'weekdays' }
      : repeatSpec.type === 'weekday' ? { freq: 'weekly', days: [repeatSpec.day] }
      : repeatSpec.type === 'interval' ? { freq: 'interval', everyDays: repeatSpec.n }
      : repeatSpec.type === 'weekly' ? { freq: 'weekly', days: [weekday(start)] }
      : { freq: 'monthly', monthDay: parseLocalDate(start).day };
    out.repeat = { pattern, end: never };
  }
  return out;
}
