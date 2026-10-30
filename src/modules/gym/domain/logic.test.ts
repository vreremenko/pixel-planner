import { describe, expect, it } from 'vitest';
import { bestSet, e1rm, exerciseOrder, formatSet, lastSessionSets, programsFor, summarize } from './logic';
import type { Program, Workout, WorkoutSet } from './types';
import type { Weekday } from '../../../core/domain/types';
import { CATALOG } from './catalog';

const catalogExercise = (id: string) => CATALOG.find((e) => e.id === id);

const meta = { createdAt: 0, updatedAt: 0 };
const w = (id: string, startedAt: number, extra: Partial<Workout> = {}): Workout => ({ id, ...meta, date: '2026-10-30', startedAt, finishedAt: startedAt + 3_600_000, title: id, ...extra });
const set = (id: string, workoutId: string, exerciseId: string, order: number, weight: number, reps: number, done = true): WorkoutSet => ({ id, ...meta, workoutId, exerciseId, date: '2026-10-30', order, weight, reps, done });
const prog = (id: string, order: number): Program => ({ id, ...meta, name: id, order, items: [] });

describe('логика тренировок', () => {
  it('расчётный максимум по Эпли', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBe(133.3);
    expect(e1rm(0, 10)).toBeNull();
  });
  it('лучший подход — по расчётному максимуму, невыполненные не считаются', () => {
    const sets = [set('a', 'w', 'x', 1, 100, 5), set('b', 'w', 'x', 2, 90, 10), set('c', 'w', 'x', 3, 200, 10, false)];
    expect(bestSet(sets, 'weight_reps')?.id).toBe('b');
  });
  it('«в прошлый раз» — подходы последней завершённой тренировки', () => {
    const ws = [w('w1', 1000), w('w2', 2000), w('now', 3000, { finishedAt: undefined })];
    const sets = [set('1', 'w1', 'x', 1, 50, 10), set('2', 'w2', 'x', 1, 55, 8), set('3', 'w2', 'x', 2, 55, 7), set('4', 'now', 'x', 1, 60, 5)];
    expect(lastSessionSets(sets, ws, 'x', 'now').map((s) => s.id)).toEqual(['2', '3']);
  });
  it('на день недели — только назначенные дни программы, без расписания — никогда', () => {
    const ps = [{ ...prog('A', 2), days: [0, 2] as Weekday[] }, { ...prog('B', 1), days: [0] as Weekday[] }, prog('C', 3)];
    expect(programsFor(ps, '2026-11-02').map((p) => p.id)).toEqual(['B', 'A']); // понедельник
    expect(programsFor(ps, '2026-11-04').map((p) => p.id)).toEqual(['A']); // среда
    expect(programsFor(ps, '2026-11-03')).toEqual([]); // вторник
  });
  it('порядок упражнений — по первому подходу', () => {
    expect(exerciseOrder([set('1', 'w', 'b', 5, 1, 1), set('2', 'w', 'a', 1, 1, 1), set('3', 'w', 'b', 2, 1, 1)])).toEqual(['a', 'b']);
  });
  it('итог: тоннаж, подходы и новый рекорд', () => {
    const old = w('old', 1000); const now = w('now', 5000);
    const sets = [set('1', 'old', 'bench-press', 1, 80, 5), set('2', 'now', 'bench-press', 1, 85, 5), set('3', 'now', 'bench-press', 2, 85, 4)];
    const s = summarize(now, sets, sets, [old, now], catalogExercise);
    expect(s).toMatchObject({ setsDone: 2, tonnage: 765, records: ['bench-press'], durationMin: 60 });
  });
  it('запись подхода', () => {
    expect(formatSet({ weight: 60, reps: 10 }, 'weight_reps')).toBe('60 × 10');
    expect(formatSet({ durationSec: 90 }, 'time')).toBe('1:30');
    expect(formatSet({ distanceM: 5000, durationSec: 1500 }, 'distance_time')).toBe('5 км · 25:00');
  });
});
