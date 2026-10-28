import { describe, expect, it } from 'vitest';
import { computeStats, heatLevel, percentDelta, weekRange } from './stats';
import type { Habit, HabitLog, Occurrence, Task } from './types';

const t = (p: Partial<Task>): Task => ({
  id: Math.random().toString(), createdAt: 0, updatedAt: 0, title: 'x', date: '2026-01-05', priority: 'low',
  done: true, order: 0, tags: [], wasInBacklog: false, postponedCount: 0, ...p,
});

describe('computeStats', () => {
  it('считает задачи, бэклог, повторяющиеся и привычки', () => {
    const occ = (date: string, status: Occurrence['status']): Occurrence => ({
      key: `s:${date}`, seriesId: 's', originalDate: date, date, title: 'r', priority: 'low', tags: [], status, order: 0,
    });
    const habit: Habit = { id: 'h', createdAt: new Date(2026, 0, 1).getTime(), updatedAt: 0, name: 'h', icon: 'star', schedule: { type: 'daily' }, archived: false, order: 0 };
    const logs: HabitLog[] = ['2026-01-05', '2026-01-06'].map((d) => ({ id: `h:${d}`, habitId: 'h', date: d, createdAt: 0, updatedAt: 0 }));
    const s = computeStats({
      tasks: [t({}), t({ wasInBacklog: true, date: '2026-01-06' }), t({ done: false }), t({ date: '2026-02-01' })],
      occurrences: [occ('2026-01-05', 'done'), occ('2026-01-06', 'missed'), occ('2026-01-07', 'pending'), occ('2026-01-08', 'pending')],
      habits: [habit],
      habitLogs: logs,
      from: '2026-01-05',
      to: '2026-01-11',
      todayDate: '2026-01-07',
    });
    expect(s.tasksClosed).toBe(2);
    expect(s.fromBacklog).toBe(1);
    expect(s.recurringRate).toBe(0.5); // сегодняшний pending не считается провалом
    expect(s.habitsScheduled).toBe(2); // 05, 06; сегодня ещё не провалено
    expect(s.habitRate).toBe(1);
    expect(s.byWeekday.slice(0, 2)).toEqual([3, 2]); // Пн: задача+экземпляр+привычка
    expect(s.total).toBe(5);
  });
});

describe('утилиты', () => {
  it('weekRange начинается с понедельника', () => {
    expect(weekRange('2026-01-08')).toEqual({ from: '2026-01-05', to: '2026-01-11' });
  });
  it('percentDelta', () => {
    expect(percentDelta(15, 10)).toBe(50);
    expect(percentDelta(5, 10)).toBe(-50);
    expect(percentDelta(3, 0)).toBeNull();
    expect(percentDelta(0, 0)).toBe(0);
  });
  it('heatLevel', () => {
    expect([0, 1, 3, 5, 8].map((n) => heatLevel(n, 8))).toEqual([0, 1, 2, 3, 4]);
  });
});
