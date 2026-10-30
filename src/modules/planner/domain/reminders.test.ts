import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyQuietHours, inQuietHours, planReminders, reminderInstant } from './reminders';
import { toInstant } from '../../../core/domain/dates';
import { DEFAULT_SETTINGS, type Settings } from '../../../core/domain/types';
import { type Occurrence, type Task } from './types';

const prevTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = prevTz;
});

describe('DST: Europe/Berlin', () => {
  beforeAll(() => {
    process.env.TZ = 'Europe/Berlin';
  });
  it('09:00 до и после перехода на летнее время остаётся 09:00 местного', () => {
    expect(toInstant('2026-03-28', '09:00').toISOString()).toBe('2026-03-28T08:00:00.000Z');
    expect(toInstant('2026-03-30', '09:00').toISOString()).toBe('2026-03-30T07:00:00.000Z');
  });
  it('несуществующее 02:30 → сдвиг вперёд на 03:30', () => {
    const d = toInstant('2026-03-29', '02:30');
    expect(d.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(d.getHours()).toBe(3);
  });
  it('неоднозначное 02:30 при переходе назад → первое вхождение (летнее)', () => {
    expect(toInstant('2026-10-25', '02:30').toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });
  it('смещение напоминания через границу DST', () => {
    // 03:10 после перехода минус 15 минут = 01:55 зимнего (00:55Z)
    expect(reminderInstant('2026-03-29', '03:10', { offsetMin: 15 }).toISOString()).toBe('2026-03-29T00:55:00.000Z');
  });
});

describe('DST: America/New_York', () => {
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  it('08.03.2026: 09:00 EDT', () => {
    expect(toInstant('2026-03-08', '09:00').toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(toInstant('2026-03-07', '09:00').toISOString()).toBe('2026-03-07T14:00:00.000Z');
  });
});

describe('тихие часы', () => {
  beforeAll(() => {
    process.env.TZ = 'Europe/Berlin';
  });
  const qh = { enabled: true, from: '23:00', to: '07:00' };
  it('через полночь', () => {
    expect(inQuietHours(toInstant('2026-01-10', '23:30'), qh)).toBe(true);
    expect(inQuietHours(toInstant('2026-01-10', '06:59'), qh)).toBe(true);
    expect(inQuietHours(toInstant('2026-01-10', '07:00'), qh)).toBe(false);
  });
  it('переносит на конец тихих часов (следующий день)', () => {
    expect(applyQuietHours(toInstant('2026-01-10', '23:30'), qh).getTime()).toBe(toInstant('2026-01-11', '07:00').getTime());
    expect(applyQuietHours(toInstant('2026-01-11', '05:00'), qh).getTime()).toBe(toInstant('2026-01-11', '07:00').getTime());
  });
  it('выключенные не действуют', () => {
    expect(inQuietHours(toInstant('2026-01-10', '23:30'), { ...qh, enabled: false })).toBe(false);
  });
});

describe('planReminders', () => {
  beforeAll(() => {
    process.env.TZ = 'Europe/Berlin';
  });
  const settings: Settings = { ...DEFAULT_SETTINGS, notificationsEnabled: true, morningSummary: { enabled: true, time: '08:00' } };
  const task: Task = {
    id: 't1', createdAt: 0, updatedAt: 0, title: 'Созвон', date: '2026-01-10', time: '10:00', priority: 'high',
    done: false, order: 0, tags: [], reminder: { offsetMin: 15 }, wasInBacklog: false, postponedCount: 0,
  };
  const base = {
    tasks: [task], occurrences: [], habits: [], habitDone: new Set<string>(), settings,
    from: toInstant('2026-01-10', '00:00'), to: toInstant('2026-01-11', '00:00'),
  };
  it('задача за 15 минут и утренняя сводка', () => {
    const r = planReminders(base);
    expect(r.map((x) => [x.kind, new Date(x.fireAt).toISOString()])).toEqual([
      ['summary', '2026-01-10T07:00:00.000Z'],
      ['task', '2026-01-10T08:45:00.000Z'],
    ]);
  });
  it('глобальное отключение', () => {
    expect(planReminders({ ...base, settings: { ...settings, notificationsEnabled: false } })).toEqual([]);
  });
  it('выполненные не напоминаются', () => {
    expect(planReminders({ ...base, tasks: [{ ...task, done: true }] }).map((x) => x.kind)).toEqual(['summary']);
  });
  it('привычка в выбранный день, без отметки', () => {
    const habit = { id: 'h1', createdAt: 0, updatedAt: 0, name: 'Вода', icon: 'drop', schedule: { type: 'daily' as const }, reminderTime: '12:00', archived: false, order: 0 };
    expect(planReminders({ ...base, tasks: [], habits: [habit] }).map((x) => x.key)).toContain('habit:h1:2026-01-10');
    expect(planReminders({ ...base, tasks: [], habits: [habit], habitDone: new Set(['h1:2026-01-10']) }).map((x) => x.kind)).toEqual(['summary']);
  });

  it('несколько напоминаний одной задачи — отдельные уведомления с разными ключами', () => {
    const multi = { ...task, reminders: [{ offsetMin: 60 }, { offsetMin: 15 }, { offsetMin: 0 }] } as Task;
    const r = planReminders({ ...base, tasks: [multi], settings: { ...settings, morningSummary: { enabled: false, time: '08:00' } } });
    expect(r.map((x) => new Date(x.fireAt).toISOString())).toEqual([
      '2026-01-10T08:00:00.000Z', // за 60 минут (задача на 10:00 по Берлину = 09:00Z)
      '2026-01-10T08:45:00.000Z', // за 15
      '2026-01-10T09:00:00.000Z', // в момент начала
    ]);
    expect(new Set(r.map((x) => x.key)).size).toBe(3);
    expect(r.map((x) => x.body)).toEqual(['Через 60 мин, в 10:00', 'Через 15 мин, в 10:00', 'Сейчас, 10:00']);
  });
  it('старое поле reminder по-прежнему работает', () => {
    const legacy = { ...task, reminder: { offsetMin: 30 } } as Task;
    const r = planReminders({ ...base, tasks: [legacy], settings: { ...settings, morningSummary: { enabled: false, time: '08:00' } } });
    expect(r.map((x) => new Date(x.fireAt).toISOString())).toEqual(['2026-01-10T08:30:00.000Z']);
  });
  it('новое поле главнее старого: пустой список — без напоминаний', () => {
    const cleared = { ...task, reminder: { offsetMin: 30 }, reminders: [] } as Task;
    expect(planReminders({ ...base, tasks: [cleared], settings: { ...settings, morningSummary: { enabled: false, time: '08:00' } } })).toEqual([]);
  });
  it('напоминания экземпляров повторяющейся задачи', () => {
    const occ = {
      key: 's1:2026-01-10', seriesId: 's1', originalDate: '2026-01-10', date: '2026-01-10', title: 'Зарядка', time: '07:00',
      priority: 'low', tags: [], reminders: [{ offsetMin: 15 }, { offsetMin: 5 }], status: 'pending', order: 0,
    } as Occurrence;
    const r = planReminders({ ...base, tasks: [], occurrences: [occ], settings: { ...settings, morningSummary: { enabled: false, time: '08:00' } } });
    expect(r.map((x) => x.key)).toEqual(['occ:s1:2026-01-10:2026-01-10T07:00-15', 'occ:s1:2026-01-10:2026-01-10T07:00-5']);
  });
});
