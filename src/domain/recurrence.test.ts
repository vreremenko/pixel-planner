import { describe, expect, it } from 'vitest';
import { buildOccurrences, countBefore, expandRule, splitRule } from './recurrence';
import type { OccurrenceOverride, RecurrenceRule, RecurringSeries } from './types';

const rule = (r: Partial<RecurrenceRule> & Pick<RecurrenceRule, 'freq'>): RecurrenceRule =>
  ({ start: '2026-01-01', end: { type: 'never' }, ...r }) as RecurrenceRule;

describe('expandRule', () => {
  it('daily', () => {
    expect(expandRule(rule({ freq: 'daily' }), '2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02',
    ]);
  });
  it('не генерирует до начала', () => {
    expect(expandRule(rule({ freq: 'daily', start: '2026-03-05' }), '2026-03-01', '2026-03-06')).toEqual([
      '2026-03-05', '2026-03-06',
    ]);
  });
  it('weekdays (2026-01-01 — четверг)', () => {
    expect(expandRule(rule({ freq: 'weekdays' }), '2026-01-01', '2026-01-07')).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07',
    ]);
  });
  it('weekly по выбранным дням (Пн, Ср)', () => {
    expect(expandRule(rule({ freq: 'weekly', days: [0, 2] }), '2026-01-01', '2026-01-14')).toEqual([
      '2026-01-05', '2026-01-07', '2026-01-12', '2026-01-14',
    ]);
  });
  it('weekly без дней — пусто и без зависания', () => {
    expect(expandRule(rule({ freq: 'weekly', days: [] }), '2026-01-01', '2026-12-31')).toEqual([]);
  });
  it('каждые N дней держит фазу от start', () => {
    expect(expandRule(rule({ freq: 'interval', everyDays: 3 }), '2026-01-05', '2026-01-12')).toEqual([
      '2026-01-07', '2026-01-10',
    ]);
  });
  it('ежемесячно 31-го → последний день короткого месяца', () => {
    expect(expandRule(rule({ freq: 'monthly', monthDay: 31 }), '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
    expect(expandRule(rule({ freq: 'monthly', monthDay: 30, start: '2028-01-01' }), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });
  it('окончание по дате', () => {
    expect(expandRule(rule({ freq: 'daily', end: { type: 'until', date: '2026-01-03' } }), '2026-01-01', '2026-01-10')).toHaveLength(3);
  });
  it('окончание по количеству — считает от начала', () => {
    const r = rule({ freq: 'weekdays', end: { type: 'count', count: 3 } });
    expect(expandRule(r, '2026-01-05', '2026-01-31')).toEqual(['2026-01-05']);
    expect(expandRule(r, '2026-01-01', '2026-01-31')).toHaveLength(3);
  });
  it('переход через DST не сдвигает даты (Европа: 29.03.2026)', () => {
    expect(expandRule(rule({ freq: 'daily' }), '2026-03-28', '2026-03-30')).toEqual([
      '2026-03-28', '2026-03-29', '2026-03-30',
    ]);
    expect(expandRule(rule({ freq: 'interval', everyDays: 7, start: '2026-03-22' }), '2026-03-22', '2026-04-05')).toEqual([
      '2026-03-22', '2026-03-29', '2026-04-05',
    ]);
  });
});

describe('split', () => {
  it('эта и все следующие: обрезает старое, сохраняет остаток count', () => {
    const r = rule({ freq: 'daily', end: { type: 'count', count: 10 } });
    expect(countBefore(r, '2026-01-04')).toBe(3);
    const { before, after } = splitRule(r, '2026-01-04');
    expect(before?.end).toEqual({ type: 'until', date: '2026-01-03' });
    expect(after).toMatchObject({ start: '2026-01-04', end: { type: 'count', count: 7 } });
  });
  it('split в первую дату — старой серии не остаётся', () => {
    expect(splitRule(rule({ freq: 'daily' }), '2026-01-01').before).toBeNull();
  });
});

describe('buildOccurrences', () => {
  const series: RecurringSeries = {
    id: 's1', createdAt: 0, updatedAt: 0, title: 'Зарядка', priority: 'medium', tags: [],
    time: '07:00', rule: rule({ freq: 'daily' }),
  };
  const ov = (o: Partial<OccurrenceOverride> & { date: string }): OccurrenceOverride => ({
    id: `s1:${o.date}`, seriesId: 's1', createdAt: 0, updatedAt: 0, ...o,
  });

  it('прошедшие невыполненные = missed, не попадают в сегодня', () => {
    const occ = buildOccurrences([series], [], '2026-01-01', '2026-01-03', '2026-01-03');
    expect(occ.map((o) => o.status)).toEqual(['missed', 'missed', 'pending']);
  });
  it('правки только этой задачи, отмена и выполнение', () => {
    const occ = buildOccurrences(
      [series],
      [ov({ date: '2026-01-01', status: 'done' }), ov({ date: '2026-01-02', cancelled: true }), ov({ date: '2026-01-03', patch: { title: 'Бег', time: '08:00' } })],
      '2026-01-01', '2026-01-03', '2026-01-03',
    );
    expect(occ).toHaveLength(2);
    expect(occ[0]?.status).toBe('done');
    expect(occ[1]).toMatchObject({ title: 'Бег', time: '08:00' });
  });
  it('перенос экземпляра на другую дату', () => {
    const ovs = [ov({ date: '2026-01-01', movedTo: '2026-01-05' })];
    expect(buildOccurrences([series], ovs, '2026-01-01', '2026-01-01', '2026-01-01')).toHaveLength(0);
    const day5 = buildOccurrences([series], ovs, '2026-01-05', '2026-01-05', '2026-01-01');
    expect(day5.map((o) => o.originalDate).sort()).toEqual(['2026-01-01', '2026-01-05']);
  });
});
