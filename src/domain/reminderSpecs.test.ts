import { describe, expect, it } from 'vitest';
import { MAX_REMINDERS, nextFreeOffset, normalizeReminders, remindersOf } from './reminderSpecs';
import type { ReminderSpec } from './types';

const r = (...o: number[]): ReminderSpec[] => o.map((offsetMin) => ({ offsetMin }) as ReminderSpec);

describe('напоминания: нормализация', () => {
  it('убирает повторы и недопустимые значения, сортирует по убыванию', () => {
    expect(normalizeReminders(r(5, 60, 15, 5, 7, 999))).toEqual(r(60, 15, 5));
    expect(normalizeReminders(r(0, 30))).toEqual(r(30, 0));
    expect(normalizeReminders(undefined)).toEqual([]);
    expect(normalizeReminders([])).toEqual([]);
  });
  it('не больше пяти', () => {
    expect(MAX_REMINDERS).toBe(5);
    expect(normalizeReminders(r(0, 5, 15, 30, 60))).toHaveLength(5);
  });
});

describe('напоминания: совместимость со старым полем', () => {
  it('читает новое поле, а если его нет — старое', () => {
    expect(remindersOf({ reminders: r(30, 5) })).toEqual(r(30, 5));
    expect(remindersOf({ reminder: { offsetMin: 15 } })).toEqual(r(15));
    expect(remindersOf({})).toEqual([]);
  });
  it('новое поле главнее старого, даже пустое (напоминания убрали)', () => {
    expect(remindersOf({ reminders: [], reminder: { offsetMin: 15 } })).toEqual([]);
    expect(remindersOf({ reminders: r(60), reminder: { offsetMin: 15 } })).toEqual(r(60));
  });
});

describe('значение для нового напоминания', () => {
  it('предлагает ходовые по очереди и не повторяет выбранные', () => {
    expect(nextFreeOffset([])).toBe(15);
    expect(nextFreeOffset([15])).toBe(60);
    expect(nextFreeOffset([15, 60, 5])).toBe(30);
    expect(nextFreeOffset([15, 60, 5, 30])).toBe(0);
    expect(nextFreeOffset([0, 5, 15, 30, 60])).toBeNull();
  });
});
