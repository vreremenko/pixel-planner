import type { Priority } from './types';

export const XP_TASK: Record<Priority, number> = { low: 10, medium: 20, high: 30 };
export const XP_OCCURRENCE = 15;
export const XP_HABIT = 15;
export const XP_ACHIEVEMENT = 50;

/** Бонус за стрик привычки: +2 XP за каждый день ряда, максимум +20. */
export function habitXp(streak: number): number {
  return XP_HABIT + Math.min(20, Math.max(0, streak - 1) * 2);
}

/** Сколько всего XP нужно, чтобы достичь уровня `level` (уровень 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 25 * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  /** XP внутри текущего уровня */
  into: number;
  /** XP, нужные на весь текущий уровень */
  span: number;
  total: number;
}

export function levelFromXp(total: number): LevelInfo {
  const xp = Math.max(0, Math.floor(total));
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  return { level, into: xp - base, span: xpForLevel(level + 1) - base, total: xp };
}

export const xpEventId = (source: string, refKey: string) => `${source}:${refKey}`;
