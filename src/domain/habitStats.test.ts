import { describe, expect, it } from 'vitest';
import { buildSeries, compactParts, countStats, formatCompact, formatValue, movingAverage, parseValue } from './habitStats';

const vals = (o: Record<string, number>) => new Map(Object.entries(o));

describe('buildSeries / movingAverage', () => {
  it('заполняет пропуски null', () => {
    const s = buildSeries(vals({ '2026-01-01': 10, '2026-01-03': 20 }), '2026-01-01', '2026-01-04');
    expect(s.map((p) => p.value)).toEqual([10, null, 20, null]);
  });
  it('среднее считается только по записанным дням окна', () => {
    const s = buildSeries(vals({ '2026-01-01': 10, '2026-01-03': 20 }), '2026-01-01', '2026-01-04');
    expect(movingAverage(s, 7)).toEqual([10, 10, 15, 15]);
    expect(movingAverage(s, 2)).toEqual([10, 10, 20, 20]);
  });
  it('нет записей в окне — null', () => {
    const s = buildSeries(vals({ '2026-01-01': 10 }), '2026-01-01', '2026-01-05');
    expect(movingAverage(s, 2)).toEqual([10, 10, null, null, null]);
  });
});

describe('countStats', () => {
  const today = '2026-01-20';
  it('пусто', () => {
    expect(countStats(new Map(), today)).toEqual({ entries: 0, total: 0, average: null, last7Avg: null, prev7Avg: null, best: null, today: null });
  });
  it('итоги, лучший день, 7 дней против предыдущих 7', () => {
    const s = countStats(
      vals({
        '2026-01-20': 30, // сегодня
        '2026-01-18': 20,
        '2026-01-14': 10, // граница последних 7 дней (14..20)
        '2026-01-13': 40, // предыдущие 7 дней (07..13)
        '2026-01-07': 20,
        '2026-01-06': 99, // вне окон
      }),
      today,
    );
    expect(s.today).toBe(30);
    expect(s.last7Avg).toBe(20);
    expect(s.prev7Avg).toBe(30);
    expect(s.best).toEqual({ date: '2026-01-06', value: 99 });
    expect(s.entries).toBe(6);
    expect(s.total).toBe(219);
    expect(s.average).toBeCloseTo(36.5);
  });
  it('при равных значениях лучшим считается более поздний день', () => {
    expect(countStats(vals({ '2026-01-01': 5, '2026-01-02': 5 }), today).best?.date).toBe('2026-01-02');
  });
});

describe('ввод чисел', () => {
  it('parseValue', () => {
    expect(parseValue('25')).toBe(25);
    expect(parseValue(' 2,5 ')).toBe(2.5);
    expect(parseValue('0')).toBe(0);
    expect(parseValue('')).toBeNull();
    expect(parseValue('abc')).toBeNull();
    expect(parseValue('-3')).toBeNull();
    expect(parseValue('1e12')).toBeNull();
  });
  it('formatValue', () => {
    expect(formatValue(12)).toBe('12');
    expect(formatValue(2.5)).toBe('2.5');
    expect(formatValue(1 / 3)).toBe('0.33');
  });
  it('formatCompact: большие числа коротко', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(9999)).toBe('9999');
    expect(formatCompact(12345)).toBe('12.3 тыс');
    expect(formatCompact(250000)).toBe('250 тыс');
    expect(formatCompact(999999)).toBe('1 млн');
    expect(formatCompact(1234567)).toBe('1.2 млн');
    expect(formatCompact(999999999)).toBe('1 млрд');
    expect(formatCompact(2_012_345_679)).toBe('2 млрд');
    expect(formatCompact(2e12)).toBe('2000 млрд');
  });
  it('compactParts: число и суффикс отдельно', () => {
    expect(compactParts(500)).toEqual({ text: '500', suffix: '' });
    expect(compactParts(12345)).toEqual({ text: '12.3', suffix: 'тыс' });
    expect(compactParts(999999999)).toEqual({ text: '1', suffix: 'млрд' });
  });
});
