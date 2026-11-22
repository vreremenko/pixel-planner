import { describe, expect, it } from 'vitest';
import { AccountData, type WireRecord } from './data';
import { TOOLS, ToolError, type ToolContext } from './tools';

let n = 0;
const ctx: ToolContext = { now: 1_000_000, today: '2026-11-18', newId: () => `id${String(++n)}` };
const rec = (t: string, row: Record<string, unknown>): WireRecord => ({ t, id: String(row.id), u: 1, d: JSON.stringify({ createdAt: 1, updatedAt: 1, ...row }) });
const run = (data: AccountData, name: string, input: Record<string, unknown> = {}) => {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(name);
  return tool.run(data, input, ctx);
};
const rows = (data: AccountData, t: string) => data.changes().filter((c) => c.t === t).map((c) => JSON.parse(c.d) as Record<string, unknown>);

describe('пауза привычки через помощника', () => {
  it('ставит на паузу на срок и без срока, показывает в списке и снимает', () => {
    const data = new AccountData([]);
    run(data, 'add_habit', { name: 'Бег' });
    expect(run(data, 'pause_habit', { habit: 'бег', days: 7 })).toBe('«Бег» на паузе по 2026-11-24 включительно; серия сохранится.');
    expect(run(data, 'list_habits')).toContain('на паузе по 2026-11-24');
    expect(run(data, 'pause_habit', { habit: 'Бег', resume: true })).toContain('Вернул «Бег» с паузы');
    expect(rows(data, 'habits').at(-1)?.pauses).toEqual([]);
    expect(run(data, 'pause_habit', { habit: 'Бег', resume: true })).toContain('и так не на паузе');
    expect(run(data, 'pause_habit', { habit: 'Бег' })).toContain('без срока');
    expect(() => run(data, 'pause_habit', { habit: 'Бег', days: 0 })).toThrow(ToolError);
    expect(run(data, 'pause_habit', { habit: 'Бег', resume: true })).toContain('Вернул');
    expect(run(data, 'pause_habit', { habit: 'Бег', until: '2026-11-18' })).toContain('по 2026-11-18 включительно');
    expect(() => run(data, 'pause_habit', { habit: 'Бег', until: '2026-11-01' })).toThrow('не раньше сегодня');
  });
});

describe('привычки через помощника', () => {
  it('создаёт, меняет, архивирует и удаляет привычку', () => {
    const data = new AccountData([]);
    expect(run(data, 'add_habit', { name: 'Вода', unit: 'стаканов', days: ['пн', 'ср', 'пт'], reminder_time: '09:00' })).toContain('пн, ср, пт, счётная, стаканов, напоминание в 09:00');
    expect(() => run(data, 'add_habit', { name: 'вода' })).toThrow('уже есть');
    expect(run(data, 'add_habit', { name: 'X', days: ['Пятница', 'понедельник', 6] })).toContain('пн, пт, вс');
    expect(() => run(data, 'add_habit', { name: 'Y', days: ['funday'] })).toThrow(ToolError);
    expect(run(data, 'update_habit', { habit: 'Вода', days: [], reminder_time: '', unit: '' })).toBe('«Вода»: каждый день, отметка, без напоминания.');
    run(data, 'update_habit', { habit: 'Вода', archived: true });
    expect(run(data, 'list_habits')).toContain('В архиве:\nВода');
    run(data, 'delete_habit', { habit: 'Вода' });
    expect(run(data, 'list_habits')).not.toContain('Вода');
  });

  it('считает выполненные дни', () => {
    const data = new AccountData([
      rec('habits', { id: 'h', name: 'Зарядка', icon: 'star', schedule: { type: 'daily' }, archived: false, order: 0 }),
      rec('habitLogs', { id: 'h:2026-11-18', habitId: 'h', date: '2026-11-18' }),
      rec('habitLogs', { id: 'h:2026-11-10', habitId: 'h', date: '2026-11-10' }),
    ]);
    expect(run(data, 'list_habits')).toContain('выполнено 1 из 7 и 2 из 30 дней');
  });
});

describe('тренировки через помощника', () => {
  it('находит упражнения по словам и группе', () => {
    const data = new AccountData([]);
    expect(run(data, 'find_exercise', { query: 'жим лёжа' })).toContain('[id: bench-press]');
    expect(run(data, 'find_exercise', { group: 'neck' })).toContain('Статика для шеи');
  });

  it('записывает тренировку, проверяет подходы по типу упражнения и показывает историю', () => {
    const data = new AccountData([]);
    const out = run(data, 'log_workout', {
      date: 'yesterday',
      exercises: [
        { exercise: 'Жим штанги лёжа', sets: [{ weight: 60, reps: 10 }, { weight: '62,5', reps: 8 }] },
        { exercise: 'подтягивания', sets: [{ reps: 8 }] },
        { exercise: 'Бег', sets: [{ distance_km: 5, duration_sec: 1500 }] },
      ],
    });
    expect(out).toContain('Записал тренировку «Тренировка» 2026-11-17 (4 подх.)');
    expect(out).toContain('Жим штанги лёжа: 60 × 10, 62.5 × 8');
    expect(out).toContain('Бег: 5 км · 25:00');
    // Ошибка в одном подходе — ничего не записывается
    const before = data.changes().length;
    expect(() => run(data, 'log_workout', { exercises: [{ exercise: 'Планка', sets: [{ reps: 3 }] }] })).toThrow('duration_sec');
    expect(data.changes()).toHaveLength(before);

    const w = rows(data, 'gym_workouts')[0];
    expect(w).toMatchObject({ date: '2026-11-17', title: 'Тренировка' });
    expect(Number(w?.finishedAt) - Number(w?.startedAt)).toBe(4 * 3 * 60_000);
    expect(run(data, 'get_workouts')).toContain('Подтягивания: 8 повт.');
    expect(run(data, 'get_workouts', { exercise: 'bench-press' })).toContain('лучший подход: 60 × 10 (2026-11-17), расчётный максимум 80 кг');

    const id = /\[id: ([^\]]+)\]/.exec(run(data, 'get_workouts'))?.[1] ?? '';
    run(data, 'delete_workout', { id });
    expect(run(data, 'get_workouts')).toBe('Тренировок пока нет.');
  });

  it('дописывает подходы в идущую в приложении тренировку', () => {
    const data = new AccountData([
      rec('gym_workouts', { id: 'w', date: '2026-11-18', startedAt: 900_000, title: 'Ноги' }),
      rec('gym_sets', { id: 's', workoutId: 'w', exerciseId: 'squat', date: '2026-11-18', order: 1, done: true, weight: 80, reps: 5 }),
    ]);
    expect(run(data, 'log_workout', { exercises: [{ exercise: 'squat', sets: [{ weight: 85, reps: 5 }] }] })).toContain('Добавил в идущую тренировку «Ноги»');
    expect(rows(data, 'gym_sets')[0]).toMatchObject({ workoutId: 'w', order: 2, done: true });
    expect(rows(data, 'gym_workouts')).toEqual([]);
  });

  it('создаёт и меняет день программы, тренировка по нему берёт название', () => {
    const data = new AccountData([]);
    expect(run(data, 'save_program', { name: 'Грудь', days: ['пн', 'чт'], exercises: [{ exercise: 'bench-press', sets: 4, reps: '8–12', weight: 60, rest_sec: 120 }] })).toContain(
      'Жим штанги лёжа: 4 × 8–12 · 60 кг, отдых 120 с',
    );
    expect(run(data, 'save_program', { program: 'Грудь', days: [] })).toContain('без расписания');
    expect(run(data, 'list_programs')).toContain('Грудь');
    expect(run(data, 'log_workout', { program: 'грудь', exercises: [{ exercise: 'bench-press', sets: [{ weight: 60, reps: 10 }] }] })).toContain('«Грудь»');
    // Все подходы до верха диапазона 8–12 — подсказка прибавить вес
    run(data, 'log_workout', { date: 'yesterday', program: 'Грудь', exercises: [{ exercise: 'bench-press', sets: [{ weight: 60, reps: 12 }, { weight: 60, reps: 12 }] }] });
    expect(run(data, 'get_workouts', { exercise: 'bench-press' })).toContain('Подсказка: в прошлый раз все подходы по 12 — пора 62,5 кг (+2,5).');
    run(data, 'delete_program', { program: 'Грудь' });
    expect(run(data, 'list_programs')).toBe('Программы пока нет.');
  });

  it('в программе у упражнений на время и кардио — свои цели, лишние отбрасываются', () => {
    const data = new AccountData([]);
    const out = run(data, 'save_program', {
      name: 'Кор и бег',
      exercises: [
        { exercise: 'plank', sets: 3, reps: '10', weight: 5, duration_sec: 45 },
        { exercise: 'running', sets: 1, distance_km: 5, duration_sec: 1800 },
      ],
    });
    expect(out).toContain('Планка: 3 × 0:45');
    expect(out).toContain('Бег: 5 км · 30:00');
    const items = (rows(data, 'gym_programs')[0]?.items ?? []) as Record<string, unknown>[];
    expect(items[0]).toEqual({ exerciseId: 'plank', sets: 3, durationSec: 45 });
  });

  it('своё упражнение: создать, использовать, удалить; справочное удалить нельзя', () => {
    const data = new AccountData([]);
    expect(run(data, 'add_exercise', { name: 'Шея с лямкой', group: 'neck', primary: ['neckBack'], tracking: 'weight_reps' })).toContain('Шея с лямкой');
    expect(run(data, 'log_workout', { exercises: [{ exercise: 'шея с лямкой', sets: [{ weight: 10, reps: 15 }] }] })).toContain('10 × 15');
    expect(() => run(data, 'delete_exercise', { exercise: 'bench-press' })).toThrow('из справочника');
    expect(run(data, 'delete_exercise', { exercise: 'Шея с лямкой' })).toContain('Удалил');
  });
});
