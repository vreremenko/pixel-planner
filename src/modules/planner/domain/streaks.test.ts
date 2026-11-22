import { describe, expect, it } from 'vitest';
import { computeStreak, currentPause, habitStreak, isDue, withPause, withoutPause } from './streaks';

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

describe('пауза привычки', () => {
  const created = new Date(2026, 0, 1).getTime();
  const daily = { schedule: { type: 'daily' as const }, createdAt: created };

  it('дни паузы серию не рвут, а отметки в паузу засчитываются', () => {
    const habit = { ...daily, pauses: [{ from: '2026-01-04', to: '2026-01-06' }] };
    const done = set('2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05', '2026-01-07');
    expect(habitStreak(habit, done, '2026-01-07')).toEqual({ current: 5, best: 5 });
    // Без паузы та же история — серия 1
    expect(habitStreak(daily, done, '2026-01-07').current).toBe(1);
  });

  it('пауза без срока: сегодня и дальше не ждём отметок', () => {
    const habit = { ...daily, pauses: withPause({}, '2026-01-10') };
    expect(isDue(habit, '2026-01-09')).toBe(true);
    expect(isDue(habit, '2026-01-10')).toBe(false);
    expect(isDue(habit, '2027-01-10')).toBe(false);
    expect(currentPause(habit, '2026-01-12')).toEqual({ from: '2026-01-10' });
  });

  it('на неделю — по шестой день включительно; вернуть — прошлое остаётся паузой, будущее отменяется', () => {
    const habit = { ...daily, pauses: withPause({}, '2026-01-10', '2026-01-16') };
    expect(habit.pauses).toEqual([{ from: '2026-01-10', to: '2026-01-16' }]);
    const back = { ...daily, pauses: withoutPause(habit, '2026-01-13') };
    expect(back.pauses).toEqual([{ from: '2026-01-10', to: '2026-01-12' }]);
    expect(isDue(back, '2026-01-13')).toBe(true);
    expect(currentPause(back, '2026-01-13')).toBeUndefined();
    // Вернули в первый же день — пауза исчезает целиком
    expect(withoutPause(habit, '2026-01-10')).toEqual([]);
  });

  it('только сегодня: пауза на один день, завтра снова ждём', () => {
    const habit = { ...daily, pauses: withPause({}, '2026-01-10', '2026-01-10') };
    expect(isDue(habit, '2026-01-10')).toBe(false);
    expect(isDue(habit, '2026-01-11')).toBe(true);
  });

  it('новая пауза заменяет текущую, но хранит прошлые', () => {
    const old = { ...daily, pauses: [{ from: '2026-01-01', to: '2026-01-03' }, { from: '2026-01-10' }] };
    expect(withPause(old, '2026-01-12', '2026-01-14')).toEqual([{ from: '2026-01-01', to: '2026-01-03' }, { from: '2026-01-12', to: '2026-01-14' }]);
  });
});
