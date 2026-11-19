import { describe, expect, it } from 'vitest';
import { AccountData, type WireRecord } from './data';
import { TOOLS, ToolError, type ToolContext } from './tools';

let n = 0;
const ctx: ToolContext = { now: 1_000, today: '2026-11-16', newId: () => `id${String(++n)}` };
const rec = (t: string, row: Record<string, unknown>): WireRecord => ({ t, id: String(row.id), u: 1, d: JSON.stringify({ createdAt: 1, updatedAt: 1, ...row }) });
const run = (data: AccountData, name: string, input: Record<string, unknown> = {}) => {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(name);
  return tool.run(data, input, ctx);
};
const base = () =>
  new AccountData([
    rec('habits', { id: 'h1', name: 'Зарядка', icon: 'star', schedule: { type: 'daily' }, archived: false, order: 0 }),
    rec('habits', { id: 'h2', name: 'Вода', icon: 'drop', schedule: { type: 'daily' }, tracking: { kind: 'count', unit: 'стаканов' }, archived: false, order: 1 }),
    rec('series', { id: 's1', title: 'Пробежка', priority: 'medium', tags: [], rule: { freq: 'daily', start: '2026-11-01', end: { type: 'never' } } }),
    rec('fin_accounts', { id: 'a1', name: 'Карта', start: 1_000_000, inPlan: true }),
    rec('fin_accounts', { id: 'a2', name: 'Копилка', start: 0, inPlan: false }),
    rec('tasks', { id: 'gone', title: 'Удалённая', date: '2026-11-16', priority: 'medium', done: false, order: 0, tags: [], wasInBacklog: false, postponedCount: 0, deletedAt: 5 }),
  ]);

describe('действия помощника', () => {
  it('добавляет задачу на завтра и в бэклог, удалённые записи не видны', () => {
    const data = base();
    expect(run(data, 'add_task', { title: 'Позвонить', date: 'tomorrow', time: '13:30', tags: ['#Работа'] })).toContain('в 13:30');
    expect(run(data, 'add_task', { title: 'Книга', date: 'backlog' })).toContain('в бэклог');
    const changes = data.changes().map((c) => JSON.parse(c.d) as { title: string; date: string | null; tags: string[] });
    expect(changes).toEqual([expect.objectContaining({ title: 'Позвонить', date: '2026-11-17', tags: ['работа'] }), expect.objectContaining({ title: 'Книга', date: null })]);
    expect(run(data, 'get_day')).not.toContain('Удалённая');
    expect(() => run(data, 'add_task', { title: 'X', time: '25:00' })).toThrow(ToolError);
  });

  it('отмечает обычную и повторяющуюся задачу', () => {
    const data = base();
    run(data, 'add_task', { title: 'Купить хлеб' });
    const day = run(data, 'get_day');
    expect(day).toContain('Пробежка');
    const taskId = /Купить хлеб \[id: ([^\]]+)\]/.exec(day)?.[1] ?? '';
    run(data, 'complete_task', { id: taskId });
    run(data, 'complete_task', { id: 's1:2026-11-16' });
    expect(run(data, 'get_day')).toContain('Задачи (2 из 2)');
    expect(data.changes().find((c) => c.t === 'overrides')?.id).toBe('s1:2026-11-16');
  });

  it('отмечает привычку по названию, у счётной требует число', () => {
    const data = base();
    expect(run(data, 'mark_habit', { habit: 'заряд' })).toContain('Зарядка');
    expect(() => run(data, 'mark_habit', { habit: 'Вода' })).toThrow('value');
    run(data, 'mark_habit', { habit: 'вода', value: 6 });
    expect(run(data, 'get_day')).toContain('Вода: 6 стаканов');
    expect(() => run(data, 'mark_habit', { habit: 'Медитация' })).toThrow('Не нашёл');
  });

  it('записывает расход в рублях на счёт плана и отказывает в неизвестной категории', () => {
    const data = base();
    expect(run(data, 'add_transaction', { kind: 'expense', amount: 500.5, category: 'транспорт' })).toContain('500,50');
    const tx = JSON.parse(data.changes()[0]?.d ?? '{}') as { amount: number; accountId: string; categoryId: string };
    expect(tx).toMatchObject({ amount: 50_050, accountId: 'a1', categoryId: 'def:transport' });
    expect(() => run(data, 'add_transaction', { kind: 'expense', amount: 1, category: 'Яхты' })).toThrow('Не нашёл');
    expect(run(data, 'finance_overview')).toContain('Транспорт: 500,50');
  });

  it('еда: из справочника по названию или со своими КБЖУ', () => {
    const data = base();
    expect(run(data, 'log_food', { name: 'Гречка варёная', grams: 200, meal: 'lunch' })).toContain('220 ккал');
    expect(run(data, 'log_food', { name: 'Бабушкин пирог', grams: 150, meal: 'snack', kcal: 300, protein: 6 })).toContain('450 ккал');
    expect(() => run(data, 'log_food', { name: 'Абракадабра', grams: 100, meal: 'lunch' })).toThrow('КБЖУ');
    // Только БЖУ — калории по 4/9/4
    expect(run(data, 'log_food', { name: 'Творог 5%', grams: 100, meal: 'snack', protein: 17, fat: 5, carbs: 3 })).toContain('125 ккал');
    expect(run(data, 'get_day')).toContain('Итого: 795 ккал');
  });

  it('еда со своими КБЖУ сохраняется в «Мои продукты» и потом находится без КБЖУ', () => {
    const data = base();
    expect(run(data, 'log_food', { name: 'Сосиски молочные', brand: 'Папа может', grams: 100, meal: 'dinner', kcal: 250, protein: 11, fat: 22, carbs: 1 })).toContain('сохранён');
    expect(run(data, 'find_food', { query: 'сосиски папа может' })).toContain('250 ккал');
    expect(run(data, 'log_food', { name: 'Сосиски молочные', brand: 'Папа может', grams: 50, meal: 'lunch' })).toContain('125 ккал');
    // Повторная запись со своими КБЖУ обновляет тот же продукт, а не плодит копии
    run(data, 'log_food', { name: 'Сосиски молочные', brand: 'Папа может', grams: 100, meal: 'dinner', kcal: 260 });
    expect(data.changes().filter((c) => c.t === 'food_items')).toHaveLength(1);
  });

  it('замеры: запись, дописывание за тот же день, сводка и удаление', () => {
    const data = base();
    run(data, 'log_measurement', { date: '2026-11-01', weight: 84, waist: 90 });
    expect(run(data, 'log_measurement', { weight: '82,5' })).toContain('Вес 82.5 кг');
    expect(run(data, 'log_measurement', { neck: 40 })).toContain('Вес 82.5 кг, Шея 40 см');
    const sum = run(data, 'get_measurements');
    expect(sum).toContain('Вес 82.5 кг (2026-11-16), −1.5 к 2026-11-01');
    expect(sum).toContain('Талия 90 см');
    expect(() => run(data, 'log_measurement', {})).toThrow(ToolError);
    expect(run(data, 'delete_measurement', { date: 'today', metrics: ['neck'] })).toContain('шея');
    expect(run(data, 'get_measurements')).not.toContain('Шея');
    run(data, 'delete_measurement', { date: '2026-11-01' });
    expect(run(data, 'get_measurements')).not.toContain('Талия');
  });

  it('категории: добавить, переставить, переименовать', () => {
    const data = base();
    expect(run(data, 'add_category', { name: 'Бензин', kind: 'expense', position: 1 })).toContain('Добавил');
    expect(run(data, 'list_categories')).toContain('Расходы:\n  1. Бензин\n  2. Продукты');
    expect(() => run(data, 'add_category', { name: 'бензин', kind: 'expense' })).toThrow('уже есть');
    expect(run(data, 'update_category', { category: 'Бензин', name: 'Топливо', position: 3 })).toBe('«Топливо»: 3-я в расходах.');
    expect(() => run(data, 'update_category', { category: 'Другое' })).toThrow('несколько');
  });

  it('удаление категории переносит операции и платежи в «Другое»; «Другое» не удаляется', () => {
    const data = base();
    run(data, 'add_transaction', { kind: 'expense', amount: 300, category: 'Кафе' });
    run(data, 'add_transaction', { kind: 'expense', amount: 200, category: 'Кафе' });
    data.put('fin_payments', { id: 'p1', name: 'Обеды', amount: 100_00, categoryId: 'def:cafe', repeat: 'month', date: '2026-11-20', skipped: [], createdAt: 1, updatedAt: 1 });
    expect(run(data, 'delete_category', { category: 'Кафе' })).toBe('Удалил категорию «Кафе»; 2 операции и 1 платёж — теперь в «Другое».');
    expect(run(data, 'list_categories')).not.toContain('Кафе');
    const rows = data.changes().filter((c) => c.t === 'fin_tx' || c.t === 'fin_payments').map((c) => (JSON.parse(c.d) as { categoryId: string }).categoryId);
    expect(new Set(rows)).toEqual(new Set(['def:other-out']));
    // Стартовая категория не возвращается после удаления
    expect(() => run(data, 'add_transaction', { kind: 'expense', amount: 1, category: 'Кафе' })).toThrow();
    expect(() => run(data, 'delete_category', { category: 'Другое', kind: 'income' })).toThrow('удалить нельзя');
    expect(run(data, 'delete_category', { category: 'Подарки' })).toBe('Удалил категорию «Подарки».');
  });

  it('норма питания и итоги недели', () => {
    const data = base();
    expect(run(data, 'get_food_goal')).toContain('не задана');
    expect(() => run(data, 'update_food_goal', { adaptive: true, kcal: 2000 })).toThrow('профиль');
    expect(run(data, 'update_food_goal', { kcal: 2200, protein: 150 })).toBe('Норма: 2200 ккал, Б150 Ж0 У0; синхронизация нормы по весу выключена.');
    run(data, 'add_task', { title: 'Сделано', date: 'today' });
    const week = run(data, 'week_summary');
    expect(week).toContain('Неделя 16–22 ноября (ещё идёт):');
    // Задача + ежедневная «Пробежка» из тестовых данных (7 дней)
    expect(week).toContain('✅ Задачи: 0 из 8');
  });

  it('удаляет и правит задачу; у повтора — только один день', () => {
    const data = base();
    run(data, 'add_task', { title: 'Спросить про книгу' });
    const id = /Спросить про книгу \[id: ([^\]]+)\]/.exec(run(data, 'get_day'))?.[1] ?? '';
    expect(run(data, 'update_task', { id, notes: 'взять с собой', time: '10:00' })).toContain('заметка, время');
    expect(run(data, 'get_day')).toContain('заметка: взять с собой');
    expect(run(data, 'delete_task', { id })).toContain('Удалил');
    expect(run(data, 'get_day')).not.toContain('Спросить про книгу');

    expect(run(data, 'update_task', { id: 's1:2026-11-18', notes: 'с Сашей' })).toContain('только за 2026-11-18');
    expect(run(data, 'get_day', { date: '2026-11-18' })).toContain('заметка: с Сашей');
    expect(run(data, 'get_day', { date: '2026-11-19' })).not.toContain('заметка');
    expect(() => run(data, 'update_task', { id: 's1:2026-11-18', tags: ['x'] })).toThrow('всей серии');
    run(data, 'delete_task', { id: 's1:2026-11-20' });
    expect(run(data, 'get_day', { date: '2026-11-20' })).not.toContain('Пробежка');
    expect(run(data, 'get_day', { date: '2026-11-21' })).toContain('Пробежка');
    expect(() => run(data, 'delete_task', { id: 'нет' })).toThrow('не найдена');
  });

  it('правит и удаляет операцию и запись еды', () => {
    const data = base();
    run(data, 'add_transaction', { kind: 'expense', amount: 300, category: 'транспорт' });
    const txId = /\[id: ([^\]]+)\]/.exec(run(data, 'list_transactions'))?.[1] ?? '';
    expect(run(data, 'update_transaction', { id: txId, amount: 450, note: 'такси' })).toContain('сумма, заметка');
    expect(run(data, 'list_transactions')).toContain('450');
    run(data, 'delete_transaction', { id: txId });
    expect(run(data, 'list_transactions')).toBe('Операций нет.');

    run(data, 'log_food', { name: 'Гречка варёная', grams: 200, meal: 'lunch' });
    const foodId = /ккал\) \[id: ([^\]]+)\]/.exec(run(data, 'get_day'))?.[1] ?? '';
    expect(run(data, 'update_food', { id: foodId, grams: 100 })).toContain('110 ккал');
    run(data, 'delete_food', { id: foodId });
    expect(run(data, 'get_day')).not.toContain('Гречка');
  });

  it('удаления и правки помечены как разрушающие', () => {
    for (const t of TOOLS) expect(t.destructive === true).toBe(/^(delete|update)_/.test(t.name));
  });

  it('у всех действий схема параметров — объект JSON Schema', () => {
    for (const t of TOOLS) {
      expect(t.inputSchema.type).toBe('object');
      for (const r of t.inputSchema.required ?? []) expect(t.inputSchema.properties).toHaveProperty(r);
    }
  });
});
