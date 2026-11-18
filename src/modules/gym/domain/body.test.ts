import { describe, expect, it } from 'vitest';
import { bodyId, cleanValues, formatDelta, seriesOf, summaries, type BodyEntry } from './body';

const e = (date: string, values: BodyEntry['values']): BodyEntry => ({ id: bodyId(date), date, values, createdAt: 0, updatedAt: 0 });

describe('замеры тела', () => {
  it('оставляет только известные показатели с разумными значениями', () => {
    expect(cleanValues({ weight: 82.456, waist: 0, neck: null, chest: -3, calf: 2000, foo: 5, biceps: 38 })).toEqual({ weight: 82.46, biceps: 38 });
  });

  it('ряд показателя по возрастанию дат, пропуская дни без него', () => {
    const list = [e('2026-11-10', { weight: 81 }), e('2026-11-01', { weight: 83, waist: 84 }), e('2026-11-05', { waist: 83 })];
    expect(seriesOf(list, 'weight')).toEqual([
      { date: '2026-11-01', value: 83 },
      { date: '2026-11-10', value: 81 },
    ]);
  });

  it('сводка: последнее, предыдущее и первое значение', () => {
    const list = [e('2026-11-01', { weight: 83, waist: 84 }), e('2026-11-05', { weight: 82 }), e('2026-11-10', { weight: 81 })];
    const s = summaries(list);
    expect(s.map((x) => x.id)).toEqual(['weight', 'waist']);
    expect(s[0]).toMatchObject({ last: { value: 81 }, prev: { value: 82 }, first: { value: 83 } });
    expect(s[1]?.prev).toBeUndefined();
  });

  it('изменение со знаком', () => {
    expect(formatDelta(1.46)).toBe('+1.5');
    expect(formatDelta(-0.84)).toBe('−0.8');
    expect(formatDelta(0.02)).toBe('0');
  });
});
