/*
 * Действия помощника: «фраза → запись в приложении» и ответы на вопросы о данных.
 * Описания и схемы параметров — обычный JSON Schema, поэтому один и тот же набор подходит любой нейросети
 * с вызовом инструментов (MCP для Claude, ChatGPT и других; позже — бот и микрофон в приложении).
 * Действия чистые: получают данные и время, возвращают текст ответа и изменения, а отправляет их вызывающий.
 */
import { addDays, formatDateDay } from '../core/domain/dates';
import type { LocalDate, SyncMeta } from '../core/domain/types';
import { balances, dayPlan, livingTypical, openDues } from '../modules/finance/domain/plan';
import { goalView, movedToday } from '../modules/finance/domain/goals';
import { rub } from '../modules/finance/domain/money';
import { ALL_DAYS, DEFAULT_CATEGORIES, type Account, type Category, type FinPrefs, type Goal, type Payment, type Tx } from '../modules/finance/domain/types';
import { CATALOG } from '../modules/food/domain/catalog';
import { portionOf, searchFoods, sumEntries } from '../modules/food/domain/logic';
import { MEALS, type FoodEntry, type FoodItem, type FoodRef, type Macros, type Meal } from '../modules/food/domain/types';
import { buildOccurrences, overrideId } from '../modules/planner/domain/recurrence';
import { isScheduled } from '../modules/planner/domain/streaks';
import { isCountHabit, type Habit, type HabitLog, type OccurrenceOverride, type Priority, type RecurringSeries, type Task } from '../modules/planner/domain/types';
import type { AccountData } from './data';

export interface ToolContext {
  now: number;
  today: LocalDate;
  newId: () => string;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
  /** Только читает данные. */
  readOnly: boolean;
  /** Удаляет или переписывает существующее: вызывать только по прямой просьбе пользователя. */
  destructive?: boolean;
  run: (data: AccountData, input: Record<string, unknown>, ctx: ToolContext) => string;
}

/** Понятная пользователю ошибка: вызывающий показывает её текст как ответ инструмента. */
export class ToolError extends Error {}

// ---------- разбор параметров ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (v: unknown, name: string, max = 300): string => {
  if (typeof v !== 'string' || !v.trim()) throw new ToolError(`Нужен параметр ${name}`);
  return v.trim().slice(0, max);
};
const optText = (v: unknown, max = 300): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown, name: string, min: number, max: number): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new ToolError(`${name}: нужно число от ${String(min)} до ${String(max)}`);
  return n;
};
/** «today», «tomorrow», «yesterday» или ГГГГ-ММ-ДД. */
function date(v: unknown, ctx: ToolContext): LocalDate {
  if (v === undefined || v === null || v === '' || v === 'today') return ctx.today;
  if (v === 'tomorrow') return addDays(ctx.today, 1);
  if (v === 'yesterday') return addDays(ctx.today, -1);
  if (typeof v === 'string' && DATE_RE.test(v)) return v;
  throw new ToolError('Дата: today, tomorrow, yesterday или ГГГГ-ММ-ДД');
}
const kopecks = (rubles: number) => Math.round(rubles * 100);
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();
const dateSchema = { type: 'string', description: 'today, tomorrow, yesterday или дата ГГГГ-ММ-ДД; по умолчанию сегодня' };
const meta = (ctx: ToolContext): SyncMeta => ({ id: ctx.newId(), createdAt: ctx.now, updatedAt: ctx.now });

/** Найти запись по названию: точное совпадение, иначе единственное частичное. */
function pick<T>(list: readonly T[], query: string, label: (x: T) => string, what: string): T {
  const q = norm(query);
  const exact = list.filter((x) => norm(label(x)) === q);
  if (exact.length === 1 && exact[0]) return exact[0];
  const part = list.filter((x) => norm(label(x)).includes(q));
  if (part.length === 1 && part[0]) return part[0];
  if (part.length === 0) throw new ToolError(`Не нашёл ${what} «${query}». Есть: ${list.map(label).slice(0, 15).join(', ') || 'ничего'}`);
  throw new ToolError(`Под «${query}» подходит несколько: ${part.map(label).slice(0, 10).join(', ')}. Уточните.`);
}

// ---------- планировщик ----------

const PRIORITY_LABEL: Record<Priority, string> = { low: 'низкий', medium: 'средний', high: 'высокий' };

function dayItems(data: AccountData, d: LocalDate, ctx: ToolContext) {
  const tasks = data.all<Task>('tasks').filter((t) => t.date === d).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order);
  const occ = buildOccurrences(data.all<RecurringSeries>('series'), data.all<OccurrenceOverride>('overrides'), d, d, ctx.today).filter((o) => o.status !== 'skipped');
  return [
    ...tasks.map((t) => ({ id: t.id, title: t.title, time: t.time, done: t.done, tags: t.tags, notes: t.notes, recurring: false })),
    ...occ.map((o) => ({ id: `${o.seriesId}:${o.originalDate}`, title: o.title, time: o.time, done: o.status === 'done', tags: o.tags, notes: o.notes, recurring: true })),
  ];
}

const itemLine = (i: ReturnType<typeof dayItems>[number]) =>
  `${i.done ? '✔' : '☐'} ${i.time ? `${i.time} ` : ''}${i.title}${i.tags.length ? ` #${i.tags.join(' #')}` : ''}${i.recurring ? ' (повтор)' : ''} [id: ${i.id}]${i.notes ? `\n    заметка: ${i.notes.slice(0, 300)}` : ''}`;

function habitLines(data: AccountData, d: LocalDate): string[] {
  const logs = new Map(data.all<HabitLog>('habitLogs').filter((l) => l.date === d).map((l) => [l.habitId, l]));
  return data
    .all<Habit>('habits')
    .filter((h) => !h.archived && isScheduled(h.schedule, d))
    .sort((a, b) => a.order - b.order)
    .map((h) => {
      const log = logs.get(h.id);
      if (isCountHabit(h)) return `${log?.value ? '✔' : '☐'} ${h.name}: ${String(log?.value ?? 0)} ${h.tracking.unit}`;
      return `${log ? '✔' : '☐'} ${h.name}`;
    });
}

// ---------- финансы ----------

function categories(data: AccountData): Category[] {
  const stored = new Map(data.all<Category>('fin_categories').map((c) => [c.id, c]));
  const defaults = DEFAULT_CATEGORIES.map((c) => stored.get(c.id) ?? { ...c, createdAt: 0, updatedAt: 0 });
  return [...defaults, ...[...stored.values()].filter((c) => !c.id.startsWith('def:'))].filter((c) => !c.archived && !c.deletedAt);
}

function financePlan(data: AccountData, ctx: ToolContext) {
  const accounts = data.all<Account>('fin_accounts').filter((a) => !a.archived);
  const txs = data.all<Tx>('fin_tx');
  const prefs = data.get<FinPrefs>('fin_prefs', 'prefs');
  const inPlan = new Set(accounts.filter((a) => a.inPlan).map((a) => a.id));
  const balance = balances(accounts, txs);
  const money = [...inPlan].reduce((a, id) => a + (balance.get(id) ?? 0), 0);
  const living = livingTypical(txs, ctx.today) ?? 0;
  const work = prefs?.workDays ?? ALL_DAYS;
  const dues = openDues(data.all<Payment>('fin_payments'), txs, ctx.today);
  const todayTx = txs.filter((t) => t.date === ctx.today && inPlan.has(t.accountId));
  const netIn = txs.filter((t) => t.date === ctx.today && t.kind === 'transfer').reduce((a, t) => a + (inPlan.has(t.toAccountId ?? '') ? t.amount : 0) - (inPlan.has(t.accountId) ? t.amount : 0), 0);
  return { accounts, txs, balance, money, dues, work, plan: dayPlan({ today: ctx.today, money, living, work, dues, todayTx, netIn }) };
}

function planLine(data: AccountData, ctx: ToolContext): string[] {
  const { plan, dues, money } = financePlan(data, ctx);
  if (dues.length === 0) return [`Деньги в плане: ${rub(money)}. Платежей с датами нет.`];
  const head = plan.dayOff ? 'Сегодня выходной' : plan.left > 0 ? `Сегодня осталось заработать ${rub(Math.ceil(plan.left / 100) * 100)} из ${rub(Math.ceil(plan.target / 100) * 100)}` : 'Цель дня закрыта';
  const next = dues.slice(0, 3).map((d) => `${d.name} ${rub(d.amount)} до ${d.date}${plan.covered.has(d) ? ' (хватает)' : ''}`);
  return [`${head}. Деньги в плане: ${rub(money)}.`, `Ближайшие платежи: ${next.join('; ')}`];
}

// ---------- питание ----------

const MEAL_IDS = MEALS.map((m) => m.id) as readonly Meal[];
const mealLabel = (m: Meal) => MEALS.find((x) => x.id === m)?.label ?? m;
const macroText = (m: Macros) => `${String(m.kcal)} ккал, Б${String(Math.round(m.protein))} Ж${String(Math.round(m.fat))} У${String(Math.round(m.carbs))}`;

function foodLines(data: AccountData, d: LocalDate): string[] {
  const entries = data.all<FoodEntry>('food_entries').filter((e) => e.date === d);
  if (entries.length === 0) return ['Еды за день не записано.'];
  const out = [`Итого: ${macroText(sumEntries(entries))}`];
  for (const m of MEAL_IDS) {
    const mine = entries.filter((e) => e.meal === m);
    if (mine.length) out.push(`${mealLabel(m)}: ${mine.map((e) => `${e.name} ${String(e.grams)} г (${String(portionOf(e, e.grams).kcal)} ккал) [id: ${e.id}]`).join(', ')}`);
  }
  return out;
}

// ---------- инструменты ----------

const BASE_TOOLS: readonly Tool[] = [
  {
    name: 'get_day',
    title: 'Сводка дня',
    description: 'Задачи, привычки, еда и финансовый план на день. Начинайте с этого, чтобы увидеть данные пользователя и id задач.',
    inputSchema: { type: 'object', properties: { date: dateSchema }, additionalProperties: false },
    readOnly: true,
    run: (data, input, ctx) => {
      const d = date(input.date, ctx);
      const items = dayItems(data, d, ctx);
      const habits = habitLines(data, d);
      return [
        `${formatDateDay(d)}${d === ctx.today ? ' (сегодня)' : ''}`,
        '',
        `Задачи (${String(items.filter((i) => i.done).length)} из ${String(items.length)}):`,
        ...(items.length ? items.map(itemLine) : ['нет']),
        '',
        'Привычки:',
        ...(habits.length ? habits : ['на этот день нет']),
        '',
        'Питание:',
        ...foodLines(data, d),
        ...(d === ctx.today ? ['', 'Финансы:', ...planLine(data, ctx)] : []),
      ].join('\n');
    },
  },
  {
    name: 'list_backlog',
    title: 'Бэклог',
    description: 'Задачи без даты (бэклог).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true,
    run: (data) => {
      const list = data.all<Task>('tasks').filter((t) => t.date === null && !t.done).sort((a, b) => a.order - b.order);
      return list.length ? list.map((t) => `☐ ${t.title}${t.tags.length ? ` #${t.tags.join(' #')}` : ''} [id: ${t.id}]`).join('\n') : 'Бэклог пуст.';
    },
  },
  {
    name: 'add_task',
    title: 'Добавить задачу',
    description: 'Добавить задачу на день (или в бэклог, если date = "backlog").',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Что сделать' },
        date: { type: 'string', description: 'today, tomorrow, ГГГГ-ММ-ДД или backlog; по умолчанию сегодня' },
        time: { type: 'string', description: 'Время ЧЧ:ММ, необязательно' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Метки без #' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['title'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const title = text(input.title, 'title', 200);
      const d = input.date === 'backlog' ? null : date(input.date, ctx);
      const time = optText(input.time);
      if (time && !TIME_RE.test(time)) throw new ToolError('Время: ЧЧ:ММ');
      if (time && d === null) throw new ToolError('У задачи в бэклоге не бывает времени');
      const tags = Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === 'string').map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean).slice(0, 10) : [];
      const priority: Priority = input.priority === 'low' || input.priority === 'high' ? input.priority : 'medium';
      const order = Math.max(-1, ...data.all<Task>('tasks').filter((t) => t.date === d).map((t) => t.order)) + 1;
      const task: Task = { ...meta(ctx), title, date: d, ...(time ? { time } : {}), priority, done: false, order, tags, wasInBacklog: d === null, postponedCount: 0 };
      data.put('tasks', task);
      return `Добавил «${title}» ${d ? `на ${formatDateDay(d)}${time ? ` в ${time}` : ''}` : 'в бэклог'}${priority !== 'medium' ? `, приоритет ${PRIORITY_LABEL[priority]}` : ''}.`;
    },
  },
  {
    name: 'complete_task',
    title: 'Отметить задачу',
    description: 'Отметить задачу выполненной (или снять отметку). id берите из get_day или list_backlog.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, done: { type: 'boolean', description: 'false — снять отметку' } }, required: ['id'], additionalProperties: false },
    readOnly: false,
    run: (data, input, ctx) => {
      const id = text(input.id, 'id', 200);
      const done = input.done !== false;
      const task = data.get<Task>('tasks', id);
      if (task) {
        data.put('tasks', { ...task, done, ...(done ? { doneAt: ctx.now } : {}), updatedAt: ctx.now });
        return `${done ? 'Отметил' : 'Снял отметку'}: «${task.title}».`;
      }
      // Повторяющаяся задача: id вида <серия>:<дата>
      const m = /^(.+):(\d{4}-\d{2}-\d{2})$/.exec(id);
      const series = m ? data.get<RecurringSeries>('series', m[1] ?? '') : undefined;
      if (!m || !series) throw new ToolError('Задача не найдена. Возьмите id из get_day.');
      const original = m[2] ?? '';
      const oid = overrideId(series.id, original);
      const cur = data.get<OccurrenceOverride>('overrides', oid);
      const base: OccurrenceOverride = cur ?? { id: oid, seriesId: series.id, date: original, createdAt: ctx.now, updatedAt: ctx.now };
      const { status: _s, doneAt: _d, ...rest } = base;
      data.put('overrides', { ...rest, ...(done ? { status: 'done' as const, doneAt: ctx.now } : {}), updatedAt: ctx.now });
      return `${done ? 'Отметил' : 'Снял отметку'}: «${series.title}» за ${original}.`;
    },
  },
  {
    name: 'mark_habit',
    title: 'Отметить привычку',
    description: 'Отметить привычку за день. У счётных привычек (стаканы воды, страницы) передайте value.',
    inputSchema: {
      type: 'object',
      properties: { habit: { type: 'string', description: 'Название привычки' }, date: dateSchema, value: { type: 'number', description: 'Для счётной привычки: сколько за день' }, done: { type: 'boolean', description: 'false — снять отметку' } },
      required: ['habit'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const habit = pick(data.all<Habit>('habits').filter((h) => !h.archived), text(input.habit, 'habit'), (h) => h.name, 'привычку');
      const d = date(input.date, ctx);
      const id = `${habit.id}:${d}`;
      const cur = data.get<HabitLog>('habitLogs', id);
      if (input.done === false) {
        if (cur) data.put('habitLogs', { ...cur, deletedAt: ctx.now, updatedAt: ctx.now });
        return `Снял отметку «${habit.name}» за ${d}.`;
      }
      if (isCountHabit(habit)) {
        const value = num(input.value, 'value', 0.01, 100_000);
        data.put('habitLogs', { id, habitId: habit.id, date: d, value, createdAt: cur?.createdAt ?? ctx.now, updatedAt: ctx.now });
        return `«${habit.name}»: ${String(value)} ${habit.tracking.unit} за ${d}.`;
      }
      data.put('habitLogs', { id, habitId: habit.id, date: d, createdAt: cur?.createdAt ?? ctx.now, updatedAt: ctx.now });
      return `Отметил «${habit.name}» за ${d}.`;
    },
  },
  {
    name: 'add_transaction',
    title: 'Доход или расход',
    description: 'Записать доход или расход. Категорию и счёт можно назвать словами; без счёта берётся основной счёт плана.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['expense', 'income'] },
        amount: { type: 'number', description: 'Сумма в рублях' },
        category: { type: 'string', description: 'Например: Продукты, Кафе, Транспорт, Работа' },
        account: { type: 'string', description: 'Название счёта, необязательно' },
        note: { type: 'string' },
        date: dateSchema,
      },
      required: ['kind', 'amount', 'category'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const kind = input.kind === 'income' ? 'income' : input.kind === 'expense' ? 'expense' : null;
      if (!kind) throw new ToolError('kind: expense или income');
      const amount = kopecks(num(input.amount, 'amount', 0.01, 100_000_000));
      const category = pick(categories(data).filter((c) => c.kind === kind), text(input.category, 'category'), (c) => c.name, 'категорию');
      const accounts = data.all<Account>('fin_accounts').filter((a) => !a.archived);
      if (accounts.length === 0) throw new ToolError('В финансах нет ни одного счёта. Добавьте счёт в приложении.');
      const accountName = optText(input.account);
      const account = accountName ? pick(accounts, accountName, (a) => a.name, 'счёт') : (accounts.find((a) => a.inPlan) ?? accounts[0]);
      if (!account) throw new ToolError('Счёт не найден');
      const note = optText(input.note, 200);
      const d = date(input.date, ctx);
      data.put<Tx>('fin_tx', { ...meta(ctx), date: d, kind, amount, accountId: account.id, categoryId: category.id, ...(note ? { note } : {}) });
      return `${kind === 'income' ? 'Доход' : 'Расход'} ${rub(amount)}, ${category.name}, счёт «${account.name}»${d !== ctx.today ? `, ${d}` : ''}.`;
    },
  },
  {
    name: 'finance_overview',
    title: 'Финансы',
    description: 'Счета, план на сегодня, ближайшие платежи, цели и траты за месяц по категориям.',
    inputSchema: { type: 'object', properties: { month: { type: 'string', description: 'ГГГГ-ММ; по умолчанию текущий' } }, additionalProperties: false },
    readOnly: true,
    run: (data, input, ctx) => {
      const month = typeof input.month === 'string' && /^\d{4}-\d{2}$/.test(input.month) ? input.month : ctx.today.slice(0, 7);
      const { accounts, txs, balance, work } = financePlan(data, ctx);
      const cats = new Map(categories(data).map((c) => [c.id, c.name]));
      const inMonth = txs.filter((t) => t.date.startsWith(month));
      const sum = (k: 'income' | 'expense') => inMonth.filter((t) => t.kind === k).reduce((a, t) => a + t.amount, 0);
      const byCat = new Map<string, number>();
      for (const t of inMonth) if (t.kind === 'expense') byCat.set(t.categoryId ?? '', (byCat.get(t.categoryId ?? '') ?? 0) + t.amount);
      const goals = data.all<Goal>('fin_goals').filter((g) => !g.paused);
      return [
        'Счета:',
        ...accounts.map((a) => `${a.name}: ${rub(balance.get(a.id) ?? 0)}${a.inPlan ? '' : ' (вне плана)'}`),
        '',
        ...planLine(data, ctx),
        '',
        `За ${month}: доходы ${rub(sum('income'))}, расходы ${rub(sum('expense'))}`,
        ...[...byCat].sort((a, b) => b[1] - a[1]).map(([id, v]) => `  ${cats.get(id) ?? 'Без категории'}: ${rub(v)}`),
        ...(goals.length
          ? ['', 'Цели:', ...goals.map((g) => {
              const v = goalView(g, balance.get(g.accountId) ?? 0, movedToday(txs, g.accountId, ctx.today), work, ctx.today);
              return `${g.name}: ${rub(v.saved)} из ${rub(g.amount)} к ${g.date}${v.status === 'behind' ? `, отстаём на ${rub(v.behind)}` : v.status === 'done' ? ', накоплено' : ''}`;
            })]
          : []),
      ].join('\n');
    },
  },
  {
    name: 'find_food',
    title: 'Найти продукт',
    description: 'Найти продукт в справочнике и своих продуктах пользователя; значения на 100 г.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    readOnly: true,
    run: (data, input) => {
      const found = searchFoods(foodList(data), text(input.query, 'query', 80), 10);
      return found.length ? found.map((f) => `${f.name}: ${macroText(f)} на 100 г${f.portion ? `, порция ${String(f.portion)} г` : ''}`).join('\n') : 'Ничего не нашёл. Можно записать еду со своими КБЖУ на 100 г.';
    },
  },
  {
    name: 'log_food',
    title: 'Записать еду',
    description: 'Записать съеденное. Без КБЖУ ищется продукт в справочнике по названию; иначе передайте значения на 100 г.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Что съели' },
        grams: { type: 'number', description: 'Сколько граммов' },
        meal: { type: 'string', enum: [...MEAL_IDS], description: 'Приём пищи' },
        date: dateSchema,
        kcal: { type: 'number', description: 'Ккал на 100 г, если продукта нет в справочнике' },
        protein: { type: 'number' },
        fat: { type: 'number' },
        carbs: { type: 'number' },
      },
      required: ['name', 'grams', 'meal'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const name = text(input.name, 'name', 120);
      const grams = Math.round(num(input.grams, 'grams', 1, 5000));
      const meal = MEAL_IDS.find((m) => m === input.meal);
      if (!meal) throw new ToolError(`meal: ${MEAL_IDS.join(', ')}`);
      let food: FoodRef;
      if (input.kcal !== undefined) {
        const m = (k: string) => (input[k] === undefined ? 0 : num(input[k], k, 0, 1000));
        food = { id: `custom:${ctx.newId()}`, name, kcal: Math.round(num(input.kcal, 'kcal', 0, 1000)), protein: m('protein'), fat: m('fat'), carbs: m('carbs') };
      } else {
        const found = searchFoods(foodList(data), name, 5);
        const exact = found.find((f) => norm(f.name) === norm(name));
        const one = exact ?? (found.length === 1 ? found[0] : undefined);
        if (!one) throw new ToolError(found.length ? `Уточните продукт: ${found.map((f) => f.name).join(', ')}. Или передайте КБЖУ на 100 г.` : 'Продукт не найден в справочнике. Передайте КБЖУ на 100 г (kcal, protein, fat, carbs).');
        food = one;
      }
      const d = date(input.date, ctx);
      const { id: foodId, name: foodName, brand, portion, kcal, protein, fat, carbs } = food;
      data.put<FoodEntry>('food_entries', { ...meta(ctx), date: d, meal, grams, foodId, name: foodName, kcal, protein, fat, carbs, ...(brand ? { brand } : {}), ...(portion ? { portion } : {}) });
      return `${mealLabel(meal)}: ${foodName} ${String(grams)} г — ${macroText(portionOf(food, grams))}.`;
    },
  },
];

// ---------- правка и удаление ----------

type FoundTask = { kind: 'task'; task: Task } | { kind: 'occurrence'; series: RecurringSeries; original: LocalDate; override: OccurrenceOverride };

/** Задача по id из get_day: обычная или один день повторяющейся (<серия>:<дата>). */
function findTask(data: AccountData, id: string, ctx: ToolContext): FoundTask {
  const task = data.get<Task>('tasks', id);
  if (task) return { kind: 'task', task };
  const m = /^(.+):(\d{4}-\d{2}-\d{2})$/.exec(id);
  const series = m ? data.get<RecurringSeries>('series', m[1] ?? '') : undefined;
  if (!m || !series) throw new ToolError('Задача не найдена. Возьмите id из get_day или list_backlog.');
  const original = m[2] ?? '';
  const oid = overrideId(series.id, original);
  return { kind: 'occurrence', series, original, override: data.get<OccurrenceOverride>('overrides', oid) ?? { id: oid, seriesId: series.id, date: original, createdAt: ctx.now, updatedAt: ctx.now } };
}

const ONLY_ON_REQUEST = ' Только по прямой просьбе пользователя.';

const EDIT_TOOLS: readonly Tool[] = [
  {
    name: 'delete_task',
    title: 'Удалить задачу',
    description: 'Удалить задачу. У повторяющейся удаляется только этот день; всю серию — с whole_series: true.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, whole_series: { type: 'boolean', description: 'Удалить все повторения, а не один день' } }, required: ['id'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const found = findTask(data, text(input.id, 'id', 200), ctx);
      if (found.kind === 'task') {
        data.put('tasks', { ...found.task, deletedAt: ctx.now, updatedAt: ctx.now });
        return `Удалил «${found.task.title}».`;
      }
      if (input.whole_series === true) {
        data.put('series', { ...found.series, deletedAt: ctx.now, updatedAt: ctx.now });
        return `Удалил повторяющуюся задачу «${found.series.title}» целиком, со всеми днями.`;
      }
      data.put('overrides', { ...found.override, cancelled: true, updatedAt: ctx.now });
      return `Убрал «${found.series.title}» только за ${found.original}. Остальные повторения на месте.`;
    },
  },
  {
    name: 'update_task',
    title: 'Изменить задачу',
    description:
      'Изменить задачу: название, заметку, дату, время, метки, приоритет. У повторяющейся меняется только этот день (метки — только у всей серии). ' +
      'Заметка заменяется целиком: чтобы дописать, передайте старый текст вместе с новым.' + ONLY_ON_REQUEST,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string', description: 'Новая заметка целиком; пустая строка убирает заметку' },
        date: { type: 'string', description: 'today, tomorrow, ГГГГ-ММ-ДД или backlog (только для обычной задачи)' },
        time: { type: 'string', description: 'ЧЧ:ММ; пустая строка убирает время (только у обычной задачи)' },
        tags: { type: 'array', items: { type: 'string' } },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['id'],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const found = findTask(data, text(input.id, 'id', 200), ctx);
      const title = optText(input.title, 200);
      const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 5000) : undefined;
      const time = typeof input.time === 'string' ? input.time.trim() : undefined;
      if (time && !TIME_RE.test(time)) throw new ToolError('Время: ЧЧ:ММ');
      const priority = input.priority === 'low' || input.priority === 'medium' || input.priority === 'high' ? input.priority : undefined;
      const changed: string[] = [];
      if (found.kind === 'task') {
        const t = { ...found.task, updatedAt: ctx.now };
        if (title) { t.title = title; changed.push('название'); }
        if (notes !== undefined) {
          if (notes) t.notes = notes;
          else delete t.notes;
          changed.push('заметка');
        }
        if (input.date !== undefined) {
          const d = input.date === 'backlog' ? null : date(input.date, ctx);
          if (d !== t.date) {
            if (d === null) delete t.time;
            if (t.date && d && d !== t.date) t.postponedCount += d > t.date ? 1 : 0;
            if (d === null) t.wasInBacklog = true;
            t.date = d;
            delete t.track;
          }
          changed.push('дата');
        }
        if (time !== undefined) {
          if (time && t.date === null) throw new ToolError('У задачи в бэклоге не бывает времени');
          if (time) t.time = time;
          else delete t.time;
          changed.push('время');
        }
        if (Array.isArray(input.tags)) { t.tags = input.tags.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^#/, '').trim().toLowerCase()).filter(Boolean).slice(0, 10); changed.push('метки'); }
        if (priority) { t.priority = priority; changed.push('приоритет'); }
        if (changed.length === 0) throw new ToolError('Нечего менять');
        data.put('tasks', t);
        return `«${t.title}»: изменено — ${changed.join(', ')}.`;
      }
      if (Array.isArray(input.tags)) throw new ToolError('Метки повторяющейся задачи меняются только у всей серии, в приложении');
      if (time === '') throw new ToolError('Убрать время у одного дня повторяющейся задачи можно только в приложении');
      const o: OccurrenceOverride = { ...found.override, patch: { ...found.override.patch }, updatedAt: ctx.now };
      const patch = o.patch ?? {};
      if (title) { patch.title = title; changed.push('название'); }
      if (notes !== undefined) { patch.notes = notes; changed.push('заметка'); }
      if (time) { patch.time = time; changed.push('время'); }
      if (priority) { patch.priority = priority; changed.push('приоритет'); }
      if (input.date !== undefined) {
        if (input.date === 'backlog') throw new ToolError('День повторяющейся задачи нельзя убрать в бэклог');
        const d = date(input.date, ctx);
        if (d === found.original) delete o.movedTo;
        else o.movedTo = d;
        delete o.track;
        changed.push('дата');
      }
      if (changed.length === 0) throw new ToolError('Нечего менять');
      o.patch = patch;
      data.put('overrides', o);
      return `«${patch.title ?? found.series.title}» только за ${found.original}: изменено — ${changed.join(', ')}. Остальные повторения не тронуты.`;
    },
  },
  {
    name: 'list_transactions',
    title: 'Операции',
    description: 'Доходы, расходы и переводы за день или месяц, с id для правки и удаления.',
    inputSchema: { type: 'object', properties: { date: dateSchema, month: { type: 'string', description: 'ГГГГ-ММ вместо дня' } }, additionalProperties: false },
    readOnly: true,
    run: (data, input, ctx) => {
      const month = typeof input.month === 'string' && /^\d{4}-\d{2}$/.test(input.month) ? input.month : null;
      const d = month ? null : date(input.date, ctx);
      const cats = new Map(categories(data).map((c) => [c.id, c.name]));
      const accounts = new Map(data.all<Account>('fin_accounts').map((a) => [a.id, a.name]));
      const list = data.all<Tx>('fin_tx').filter((t) => (month ? t.date.startsWith(month) : t.date === d)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
      if (list.length === 0) return 'Операций нет.';
      return list
        .map((t) => {
          const what = t.kind === 'transfer' ? `перевод ${accounts.get(t.accountId) ?? '?'} → ${accounts.get(t.toAccountId ?? '') ?? '?'}` : `${t.kind === 'income' ? 'доход' : 'расход'}, ${cats.get(t.categoryId ?? '') ?? 'без категории'}, ${accounts.get(t.accountId) ?? '?'}`;
          return `${t.date} ${rub(t.amount)} ${what}${t.note ? ` «${t.note}»` : ''} [id: ${t.id}]`;
        })
        .join('\n');
    },
  },
  {
    name: 'update_transaction',
    title: 'Изменить операцию',
    description: 'Изменить доход или расход: сумму, категорию, счёт, заметку, дату. id — из list_transactions.' + ONLY_ON_REQUEST,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, amount: { type: 'number', description: 'Рубли' }, category: { type: 'string' }, account: { type: 'string' }, note: { type: 'string', description: 'Пустая строка убирает заметку' }, date: dateSchema },
      required: ['id'],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const tx = data.get<Tx>('fin_tx', text(input.id, 'id', 200));
      if (!tx) throw new ToolError('Операция не найдена. Возьмите id из list_transactions.');
      const next: Tx = { ...tx, updatedAt: ctx.now };
      const changed: string[] = [];
      if (input.amount !== undefined) { next.amount = kopecks(num(input.amount, 'amount', 0.01, 100_000_000)); changed.push('сумма'); }
      if (input.category !== undefined) {
        if (tx.kind === 'transfer') throw new ToolError('У перевода нет категории');
        next.categoryId = pick(categories(data).filter((c) => c.kind === tx.kind), text(input.category, 'category'), (c) => c.name, 'категорию').id;
        changed.push('категория');
      }
      if (input.account !== undefined) { next.accountId = pick(data.all<Account>('fin_accounts').filter((a) => !a.archived), text(input.account, 'account'), (a) => a.name, 'счёт').id; changed.push('счёт'); }
      if (typeof input.note === 'string') {
        const note = input.note.trim().slice(0, 200);
        if (note) next.note = note;
        else delete next.note;
        changed.push('заметка');
      }
      if (input.date !== undefined) { next.date = date(input.date, ctx); changed.push('дата'); }
      if (changed.length === 0) throw new ToolError('Нечего менять');
      data.put('fin_tx', next);
      return `Операция ${rub(next.amount)} от ${next.date}: изменено — ${changed.join(', ')}.`;
    },
  },
  {
    name: 'delete_transaction',
    title: 'Удалить операцию',
    description: 'Удалить доход, расход или перевод. Вместе с доходом удаляется отложенное с него в копилку; если это оплата платежа, срок снова станет неоплаченным.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const tx = data.get<Tx>('fin_tx', text(input.id, 'id', 200));
      if (!tx) throw new ToolError('Операция не найдена. Возьмите id из list_transactions.');
      const linked = data.all<Tx>('fin_tx').filter((t) => t.kind === 'transfer' && t.fromTxId === tx.id);
      for (const t of [...linked, tx]) data.put('fin_tx', { ...t, deletedAt: ctx.now, updatedAt: ctx.now });
      return `Удалил операцию ${rub(tx.amount)} от ${tx.date}${linked.length ? ` и отложенное с неё (${rub(linked.reduce((a, t) => a + t.amount, 0))})` : ''}${tx.paymentId ? '. Срок платежа снова неоплачен' : ''}.`;
    },
  },
  {
    name: 'update_food',
    title: 'Изменить запись еды',
    description: 'Изменить граммы, приём пищи или дату у записи еды. id — из get_day.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, grams: { type: 'number' }, meal: { type: 'string', enum: [...MEAL_IDS] }, date: dateSchema }, required: ['id'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const e = data.get<FoodEntry>('food_entries', text(input.id, 'id', 200));
      if (!e) throw new ToolError('Запись не найдена. Возьмите id из get_day.');
      const next: FoodEntry = { ...e, updatedAt: ctx.now };
      if (input.grams !== undefined) next.grams = Math.round(num(input.grams, 'grams', 1, 5000));
      if (input.meal !== undefined) {
        const meal = MEAL_IDS.find((m) => m === input.meal);
        if (!meal) throw new ToolError(`meal: ${MEAL_IDS.join(', ')}`);
        next.meal = meal;
      }
      if (input.date !== undefined) next.date = date(input.date, ctx);
      data.put('food_entries', next);
      return `${mealLabel(next.meal)} ${next.date}: ${next.name} ${String(next.grams)} г — ${macroText(portionOf(next, next.grams))}.`;
    },
  },
  {
    name: 'delete_food',
    title: 'Удалить запись еды',
    description: 'Удалить запись еды. id — из get_day.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const e = data.get<FoodEntry>('food_entries', text(input.id, 'id', 200));
      if (!e) throw new ToolError('Запись не найдена. Возьмите id из get_day.');
      data.put('food_entries', { ...e, deletedAt: ctx.now, updatedAt: ctx.now });
      return `Удалил ${e.name} ${String(e.grams)} г (${mealLabel(e.meal)}, ${e.date}).`;
    },
  },
];

/** Справочник и свои продукты пользователя. */
function foodList(data: AccountData): FoodRef[] {
  const own = data.all<FoodItem>('food_items').map(({ id, name, brand, portion, kcal, protein, fat, carbs }) => ({ id, name, kcal, protein, fat, carbs, ...(brand ? { brand } : {}), ...(portion ? { portion } : {}) }));
  return [...own, ...CATALOG];
}

export const TOOLS: readonly Tool[] = [...BASE_TOOLS, ...EDIT_TOOLS];
