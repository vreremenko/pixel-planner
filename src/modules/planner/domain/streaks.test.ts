import { describe, expect, it } from 'vitest';
import { computeStreak } from './streaks';

const set = (...d: string[]) => new Set(d);

describe('computeStreak', () => {
  it('ежедневная: считает подряд до вчера, если сегодня ещё не выполнено', () => {
    const s = computeStreak({ type: 'daily' }, set('2026-01-03', '2026-01-04', '2026-01-05'), '2026-01-06', '2026-01-01');
    expect(s.current).toBe(3);
  });
  it('пропуск рвёт стрик, рекорд сохраняется', () => {
    const s = computeStreak({ type: 'daily' }, set('2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'), '2026-01-05', '2026-01-01');
    expect(s).toEqual({ current: 1, best: 3 });
  });
  it('невыбранные дни не обнуляют стрик (Пн/Ср/Пт)', () => {
    // 2026-01-05 Пн, 07 Ср, 09 Пт, 12 Пн
    const s = computeStreak({ type: 'days', days: [0, 2, 4] }, set('2026-01-05', '2026-01-07', '2026-01-09', '2026-01-12'), '2026-01-13', '2026-01-05');
    expect(s.current).toBe(4);
    expect(s.best).toBe(4);
  });
  it('пропуск запланированного дня обнуляет', () => {
    const s = computeStreak({ type: 'days', days: [0, 2, 4] }, set('2026-01-05', '2026-01-09'), '2026-01-10', '2026-01-05');
    expect(s.current).toBe(1);
  });
  it('пусто', () => {
    expect(computeStreak({ type: 'daily' }, set(), '2026-01-05', '2026-01-01')).toEqual({ current: 0, best: 0 });
  });
});
