import { describe, expect, it } from 'vitest';
import { digestText, planWeekly, weekLabel, type DigestData } from './weeklyDigest';

const m = { createdAt: 0, updatedAt: 0 };
const empty: DigestData = { tasks: [], series: [], overrides: [], habits: [], habitLogs: [], txs: [], categories: [], workouts: [], sets: [], food: [], body: [] };
// Неделя 16–22 ноября 2026 (Пн–Вс)
const END = '2026-11-22';

describe('итоги недели', () => {
  it('подписи недели', () => {
    expect(weekLabel('2026-11-16', END)).toBe('16–22 ноября');
    expect(weekLabel('2026-10-26', '2026-11-01')).toBe('26 октября – 1 ноября');
  });

  it('строки только по разделам с данными; выключенные разделы пропускаются', () => {
    const data: DigestData = {
      ...empty,
      tasks: [
        { ...m, id: 't1', title: 'A', date: '2026-11-17', priority: 'medium', done: true, order: 0, tags: [], wasInBacklog: false, postponedCount: 0 },
        { ...m, id: 't2', title: 'B', date: '2026-11-18', priority: 'medium', done: false, order: 1, tags: [], wasInBacklog: false, postponedCount: 0 },
        { ...m, id: 't3', title: 'Старая', date: '2026-11-10', priority: 'medium', done: true, order: 0, tags: [], wasInBacklog: false, postponedCount: 0 },
      ],
      habits: [{ ...m, id: 'h', name: 'Зарядка', icon: 'star', schedule: { type: 'days', days: [0, 2, 4] }, archived: false, order: 0 }],
      habitLogs: [{ ...m, id: 'h:2026-11-16', habitId: 'h', date: '2026-11-16' }, { ...m, id: 'h:2026-11-18', habitId: 'h', date: '2026-11-18' }],
      txs: [
        { ...m, id: 'x1', date: '2026-11-17', kind: 'expense', amount: 300_000, accountId: 'a', categoryId: 'def:food' },
        { ...m, id: 'x2', date: '2026-11-19', kind: 'expense', amount: 50_000, accountId: 'a', categoryId: 'def:cafe' },
        { ...m, id: 'x3', date: '2026-11-20', kind: 'income', amount: 4_000_000, accountId: 'a', categoryId: 'def:work' },
      ],
      workouts: [{ ...m, id: 'w', date: '2026-11-18', startedAt: 1, finishedAt: 2, title: 'Грудь' }],
      sets: [
        { ...m, id: 's1', workoutId: 'w', exerciseId: 'bench-press', date: '2026-11-18', order: 1, done: true },
        { ...m, id: 's2', workoutId: 'w', exerciseId: 'bench-press', date: '2026-11-18', order: 2, done: true },
      ],
      food: [
        { ...m, id: 'f1', date: '2026-11-16', meal: 'lunch', grams: 200, name: 'Гречка', foodId: 'x', kcal: 110, protein: 4, fat: 1, carbs: 21 },
        { ...m, id: 'f2', date: '2026-11-17', meal: 'lunch', grams: 100, name: 'Гречка', foodId: 'x', kcal: 110, protein: 4, fat: 1, carbs: 21 },
      ],
      foodGoalKcal: 2300,
      body: [
        { ...m, id: 'body-2026-11-10', date: '2026-11-10', values: { weight: 83.2 } },
        { ...m, id: 'body-2026-11-21', date: '2026-11-21', values: { weight: 82.6, waist: 86 } },
      ],
    };
    const text = digestText(data, END);
    expect(text).toContain('✅ Задачи: 1 из 2');
    expect(text).toContain('⭐ Привычки: 67% (2 из 3)');
    expect(text).toContain('💸 Расходы: 3 500 ₽, больше всего — Продукты (3 000 ₽); доходы 40 000 ₽');
    expect(text).toContain('🏋 Тренировки: 1, подходов 2');
    expect(text).toContain('⚖ Вес: 82,6 кг (−0,6 за неделю)');
    expect(text).toContain('🍎 Питание: в среднем 165 ккал в день (цель 2 300), записано дней: 2 из 7');
    expect(digestText(empty, END)).toBe('');
  });

  it('напоминание — в воскресенье в выбранное время, выключатель работает', () => {
    const from = new Date(2026, 10, 19, 12, 0);
    const to = new Date(2026, 10, 26, 12, 0);
    const list = planWeekly({ weeklyDigest: { enabled: true, time: '19:00' } }, from, to, () => 'текст');
    expect(list.map((r) => [r.key, new Date(r.fireAt).getHours(), r.title])).toEqual([['weekly:2026-11-22', 19, 'Итоги недели, 16–22 ноября']]);
    expect(planWeekly({ weeklyDigest: { enabled: false, time: '19:00' } }, from, to, () => 'текст')).toEqual([]);
    expect(planWeekly({ weeklyDigest: { enabled: true, time: '19:00' } }, from, to, () => '')[0]?.body).toContain('записей не было');
  });
});
