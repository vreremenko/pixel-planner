import { describe, expect, it } from 'vitest';
import { cleanItem, defaultItem, durationInput, formatDuration, parseDuration, programTarget } from './tracking';
import { programItemsFromSets } from './logic';
import type { WorkoutSet } from './types';

describe('типы записи упражнений', () => {
  it('время: формат и разбор', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(parseDuration('90', 'sec')).toBe(90);
    expect(parseDuration('25,5', 'min')).toBe(1530);
    expect(parseDuration('1:30', 'sec')).toBe(90);
    expect(parseDuration('1:02:05', 'min')).toBe(3725);
    expect(parseDuration('1:75', 'sec')).toBeNull();
    expect(parseDuration('абв', 'sec')).toBeNull();
    expect(parseDuration('', 'sec')).toBeNull();
    expect(durationInput(1530, 'min')).toBe('25.5');
    expect(durationInput(45, 'sec')).toBe('45');
  });

  it('цели программы по типу упражнения', () => {
    expect(programTarget({ exerciseId: 'x', sets: 3, reps: '8–12', weight: 60 }, 'weight_reps')).toBe('3 × 8–12 · 60 кг');
    expect(programTarget({ exerciseId: 'x', sets: 3, reps: '10', weight: 60 }, 'reps')).toBe('3 × 10');
    expect(programTarget({ exerciseId: 'x', sets: 3, durationSec: 60 }, 'time')).toBe('3 × 1:00');
    expect(programTarget({ exerciseId: 'x', sets: 1, distanceM: 5000, durationSec: 1800 }, 'distance_time')).toBe('5 км · 30:00');
    expect(programTarget({ exerciseId: 'x', sets: 1 }, 'distance_time')).toBe('—');
  });

  it('новый пункт и очистка от чужих целей', () => {
    expect(defaultItem('plank', 'time')).toEqual({ exerciseId: 'plank', sets: 3, durationSec: 60 });
    expect(cleanItem({ exerciseId: 'p', sets: 3, reps: '8–12', weight: 20, durationSec: 45, restSec: 60 }, 'time')).toEqual({ exerciseId: 'p', sets: 3, durationSec: 45, restSec: 60 });
    expect(cleanItem({ exerciseId: 'r', sets: 1, reps: '10', distanceM: 5000, durationSec: 1500, restSec: 60 }, 'distance_time')).toEqual({ exerciseId: 'r', sets: 1, distanceM: 5000, durationSec: 1500 });
  });

  it('день программы из тренировки берёт время и дистанцию', () => {
    const set = (exerciseId: string, p: Partial<WorkoutSet>): WorkoutSet => ({ id: `${exerciseId}${String(p.order)}`, workoutId: 'w', exerciseId, date: '2026-11-18', order: p.order ?? 0, done: true, createdAt: 0, updatedAt: 0, ...p });
    const items = programItemsFromSets([set('plank', { order: 1, durationSec: 60 }), set('plank', { order: 2, durationSec: 75 }), set('running', { order: 3, distanceM: 5000, durationSec: 1500 })], (id) => (id === 'plank' ? 'time' : 'distance_time'));
    expect(items).toEqual([
      { exerciseId: 'plank', sets: 2, durationSec: 75 },
      { exerciseId: 'running', sets: 1, durationSec: 1500, distanceM: 5000 },
    ]);
  });
});
