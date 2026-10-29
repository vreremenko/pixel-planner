import { withChecked } from './checklist';
import { addDays, daysInMonth, diffDays, parseLocalDate, weekday, WEEKDAYS_SHORT } from './dates';
import type {
  LocalDate,
  Occurrence,
  OccurrenceOverride,
  RecurrenceRule,
  RecurringSeries,
} from './types';

/** Подходит ли дата под шаблон правила (без учёта окончания и count). */
export function matchesPattern(rule: RecurrenceRule, d: LocalDate): boolean {
  if (d < rule.start) return false;
  switch (rule.freq) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekday(d) < 5;
    case 'weekly':
      return rule.days.includes(weekday(d));
    case 'interval':
      return diffDays(d, rule.start) % Math.max(1, rule.everyDays) === 0;
    case 'monthly': {
      const { y, m, day } = parseLocalDate(d);
      // 31-е в коротком месяце => последний день месяца
      return day === Math.min(rule.monthDay, daysInMonth(y, m));
    }
  }
}

/** Защита от бесконечного цикла при некорректном правиле (напр. weekly без дней). */
const MAX_SCAN_DAYS = 366 * 50;

/**
 * Даты экземпляров правила в диапазоне [from, to] включительно.
 * Работает только с календарными датами, поэтому DST и смена пояса не влияют.
 */
export function expandRule(rule: RecurrenceRule, from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let lastDate: LocalDate | null = rule.end.type === 'until' ? rule.end.date : null;
  let skipBefore: LocalDate = rule.start;

  if (rule.end.type === 'count') {
    // Для count нужно пройти от начала, чтобы знать номер экземпляра.
    let n = 0;
    let d = rule.start;
    for (let i = 0; i < MAX_SCAN_DAYS && n < rule.end.count; i++, d = addDays(d, 1)) {
      if (matchesPattern(rule, d)) {
        n++;
        if (d >= from && d <= to) out.push(d);
      }
      if (d >= to) break;
    }
    return out;
  }

  if (from > skipBefore) skipBefore = from;
  if (lastDate === null || to < lastDate) lastDate = to;
  for (let d = skipBefore, i = 0; d <= lastDate && i < MAX_SCAN_DAYS; d = addDays(d, 1), i++) {
    if (matchesPattern(rule, d)) out.push(d);
  }
  return out;
}

export function occursOn(rule: RecurrenceRule, d: LocalDate): boolean {
  return expandRule(rule, d, d).length === 1;
}

/** Номер экземпляра (0-based) — нужен для «эта и все следующие» при окончании по count. */
export function countBefore(rule: RecurrenceRule, d: LocalDate): number {
  if (d <= rule.start) return 0;
  const plain: RecurrenceRule = { ...rule, end: { type: 'never' } };
  return expandRule(plain, rule.start, addDays(d, -1)).length;
}

export const overrideId = (seriesId: string, date: LocalDate) => `${seriesId}:${date}`;

/**
 * Экземпляры всех серий, попадающие на даты [from, to], с наложенными правками.
 * Перенесённые экземпляры (movedTo) показываются в новой дате.
 * Прошедшие невыполненные получают статус 'missed' — в «сегодня» они не переносятся.
 */
export function buildOccurrences(
  seriesList: readonly RecurringSeries[],
  overrides: readonly OccurrenceOverride[],
  from: LocalDate,
  to: LocalDate,
  todayDate: LocalDate,
): Occurrence[] {
  const bySeries = new Map<string, Map<LocalDate, OccurrenceOverride>>();
  for (const o of overrides) {
    if (o.deletedAt) continue;
    let m = bySeries.get(o.seriesId);
    if (!m) bySeries.set(o.seriesId, (m = new Map<LocalDate, OccurrenceOverride>()));
    m.set(o.date, o);
  }

  const out: Occurrence[] = [];
  for (const s of seriesList) {
    if (s.deletedAt) continue;
    const ovs = bySeries.get(s.id) ?? new Map<LocalDate, OccurrenceOverride>();
    const dates = new Set(expandRule(s.rule, from, to));
    // Экземпляры, перенесённые В диапазон из других дат
    for (const o of ovs.values()) {
      if (o.movedTo && o.movedTo >= from && o.movedTo <= to && occursOn(s.rule, o.date)) {
        dates.add(o.date);
      }
    }
    for (const original of dates) {
      const o = ovs.get(original);
      if (o?.cancelled) continue;
      const date = o?.movedTo ?? original;
      if (date < from || date > to) continue;
      const p = o?.patch ?? {};
      const status =
        o?.status ?? (date < todayDate ? ('missed' as const) : ('pending' as const));
      const occ: Occurrence = {
        key: overrideId(s.id, original),
        seriesId: s.id,
        originalDate: original,
        date,
        title: p.title ?? s.title,
        priority: p.priority ?? s.priority,
        tags: s.tags,
        status,
        order: o?.order ?? -1000 + (s.time ? Number(s.time.replace(':', '')) / 10000 : 0),
      };
      const notes = p.notes ?? s.notes;
      if (notes !== undefined) occ.notes = notes;
      const template = 'checklist' in p ? p.checklist : s.checklist;
      if (template && template.length > 0) occ.checklist = withChecked(template, o?.checked ?? []);
      const time = 'time' in p ? p.time : s.time;
      if (time !== undefined) occ.time = time;
      const reminder = 'reminder' in p ? p.reminder : s.reminder;
      if (reminder !== undefined) occ.reminder = reminder;
      if (o?.doneAt !== undefined) occ.doneAt = o.doneAt;
      out.push(occ);
    }
  }
  return out;
}

/**
 * «Эта и все следующие»: обрезает исходное правило до дня перед `from`
 * и возвращает правило для новой серии, начинающейся с `from`.
 * Для окончания по количеству остаток повторов переходит в новую серию.
 */
export function splitRule(
  rule: RecurrenceRule,
  from: LocalDate,
): { before: RecurrenceRule | null; after: RecurrenceRule } {
  const done = countBefore(rule, from);
  const after: RecurrenceRule =
    rule.end.type === 'count'
      ? { ...rule, start: from, end: { type: 'count', count: Math.max(1, rule.end.count - done) } }
      : { ...rule, start: from };
  // Для interval сохраняем «фазу» исходного правила, начиная с самой даты from.
  const before: RecurrenceRule | null =
    done === 0 ? null : { ...rule, end: { type: 'until', date: addDays(from, -1) } };
  return { before, after };
}

export function describeRule(rule: RecurrenceRule): string {
  let base: string;
  switch (rule.freq) {
    case 'daily':
      base = 'Каждый день';
      break;
    case 'weekdays':
      base = 'По будням';
      break;
    case 'weekly':
      base =
        rule.days.length === 1
          ? `Раз в неделю (${WEEKDAYS_SHORT[rule.days[0] ?? 0] ?? ''})`
          : `По дням: ${[...rule.days].sort().map((d) => WEEKDAYS_SHORT[d]).join(', ')}`;
      break;
    case 'interval':
      base = `Каждые ${rule.everyDays} дн.`;
      break;
    case 'monthly':
      base = `Каждый месяц, ${rule.monthDay}-го`;
      break;
  }
  if (rule.end.type === 'until') base += ` до ${rule.end.date.split('-').reverse().join('.')}`;
  if (rule.end.type === 'count') base += `, ${rule.end.count} раз`;
  return base;
}
