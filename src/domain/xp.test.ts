import { describe, expect, it } from 'vitest';
import { habitXp, levelFromXp, xpForLevel } from './xp';
import { ACHIEVEMENTS, newlyUnlocked, type AchievementContext } from './achievements';

describe('уровни', () => {
  it('пороги', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(3)).toBe(150);
  });
  it('levelFromXp', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, span: 50, total: 0 });
    expect(levelFromXp(149)).toMatchObject({ level: 2, into: 99, span: 100 });
    expect(levelFromXp(150).level).toBe(3);
  });
  it('бонус за стрик ограничен', () => {
    expect(habitXp(1)).toBe(15);
    expect(habitXp(100)).toBe(35);
  });
});

describe('достижения', () => {
  const ctx: AchievementContext = {
    tasksClosed: 100, closedFromBacklog: 0, backlogCount: 2, backlogEverUsed: true, bestHabitStreak: 7,
    level: 1, perfectDays: 0, earlyBird: false, perfectHabitWeek: false, habitsCreated: 1,
  };
  it('выдаёт новые и не повторяет открытые', () => {
    const ids = newlyUnlocked(ctx, new Set(['first-task'])).map((a) => a.id);
    expect(ids).toEqual(['tasks-10', 'tasks-100', 'first-habit', 'streak-7']);
  });
  it('уникальные id', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
