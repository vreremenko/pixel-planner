import { describe, expect, it } from 'vitest';
import { MAX_REMINDERS, nextFreeOffset, normalizeReminders, reminderLabel, reminderShort, remindersOf } from './reminderSpecs';
import type { ReminderSpec } from './types';

const r = (...o: number[]): ReminderSpec[] => o.map((offsetMin) => ({ offsetMin }) as ReminderSpec);

describe('напоминания: нормализация', () => {
  it('убирает повторы и недопустимые значения, сортирует по убыванию', () => {
    expect(normalizeReminders(r(5, 60, 15, 5, 7, 999))).toEqual(r(60, 15, 5));
    expect(normalizeReminders(r(0, 30))).toEqual(r(30, 0));
    expect(normalizeReminders(undefined)).toEqual([]);
    expect(normalizeReminders([])).toEqual([]);
  });
  it('старое «за 15 минут» и новое «за день» сохраняются', () => {
    expect(normalizeReminders(r(15, 1440))).toEqual(r(1440, 15));
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
    expect(nextFreeOffset([])).toBe(30);
    expect(nextFreeOffset([30])).toBe(60);
    expect(nextFreeOffset([30, 60, 5])).toBe(1440);
    expect(nextFreeOffset([30, 60, 5, 1440])).toBe(0);
    expect(nextFreeOffset([0, 5, 30, 60, 1440])).toBeNull();
    // старое «за 15 минут» не мешает выбрать остальные
    expect(nextFreeOffset([15])).toBe(30);
  });
});

describe('подписи напоминаний', () => {
  it('полные и короткие', () => {
    expect([0, 5, 30, 60, 1440].map(reminderLabel)).toEqual(['В момент начала', 'За 5 минут', 'За 30 минут', 'За час', 'За день']);
    expect([0, 5, 60, 1440].map(reminderShort)).toEqual(['', '−5м', '−1ч', '−1д']);
  });
});
