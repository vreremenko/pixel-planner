/*
 * Действия помощника: «фраза → запись в приложении» и ответы на вопросы о данных.
 * Описания и схемы параметров — обычный JSON Schema, поэтому один и тот же набор подходит любой нейросети
 * с вызовом инструментов (MCP для Claude, ChatGPT и других; позже — бот и микрофон в приложении).
 * Действия чистые: получают данные и время, возвращают текст ответа и изменения, а отправляет их вызывающий.
 */
import { addDays, formatDateDay, weekday } from '../core/domain/dates';
import type { LocalDate } from '../core/domain/types';
import { balances, dayPlan, livingTypical, openDues } from '../modules/finance/domain/plan';
import { goalView, movedToday } from '../modules/finance/domain/goals';
import { rub } from '../modules/finance/domain/money';
import { ALL_DAYS, type Account, type Category, type FinPrefs, type Goal, type Payment, type Tx } from '../modules/finance/domain/types';
import { CATALOG } from '../modules/food/domain/catalog';
import { METRICS, METRIC_IDS, bodyId, formatDelta, summaries, type BodyEntry, type BodyValues } from '../modules/gym/domain/body';
import { kcalFromMacros, portionOf, searchFoods, sumEntries } from '../modules/food/domain/logic';
import { MEALS, type FoodEntry, type FoodItem, type FoodRef, type Macros, type Meal } from '../modules/food/domain/types';
import { buildOccurrences, overrideId } from '../modules/planner/domain/recurrence';
import { normalizeReminders, remindersOf } from '../modules/planner/domain/reminderSpecs';
import { isScheduled } from '../modules/planner/domain/streaks';
import { REMINDER_OFFSETS, isCountHabit, type ReminderOffset, type ReminderSpec, type Habit, type HabitLog, type OccurrenceOverride, type Priority, type RecurringSeries, type Task } from '../modules/planner/domain/types';
import type { AccountData } from './data';
import { ONLY_ON_REQUEST, TIME_RE, ToolError, date, dateSchema, meta, norm, num, optText, pick, text, type Tool, type ToolContext } from './toolkit';
import { GYM_TOOLS } from './gymTools';
import { HABIT_TOOLS } from './habitTools';
import { CATEGORY_TOOLS, allCategories } from './categoryTools';
import { SUMMARY_TOOLS } from './summaryTools';

export { ToolError, type Tool, type ToolContext } from './toolkit';

const kopecks = (rubles: number) => Math.round(rubles * 100);

/** Напоминания задачи: за сколько минут до начала. Не переданы — как в приложении: в момент начала, если есть время. */
const remindersSchema = {
  type: 'array',
  items: { type: 'number', enum: [...REMINDER_OFFSETS] },
  description: 'За сколько минут до начала напомнить: 0 — в момент начала, 5, 15, 30, 60 — за час, 1440 — за день. Пустой список — без напоминаний. Нужно время задачи.',
};
function reminderSpecs(v: unknown): ReminderSpec[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new ToolError('reminders: список минут, например [0, 60]');
  const bad: unknown = (v as unknown[]).find((x) => !(REMINDER_OFFSETS as readonly unknown[]).includes(x));
  if (bad !== undefined) throw new ToolError(`reminders: можно ${REMINDER_OFFSETS.join(', ')} минут`);
  return normalizeReminders((v as ReminderOffset[]).map((offsetMin) => ({ offsetMin })));
}
const reminderText = (list: readonly ReminderSpec[]) =>
  list.length ? `, напомню ${list.map((r) => (r.offsetMin === 0 ? 'в начале' : r.offsetMin === 60 ? 'за час' : r.offsetMin === 1440 ? 'за день' : `за ${String(r.offsetMin)} мин`)).join(' и ')}` : '';

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
  return allCategories(data).filter((c) => !c.archived && !c.deletedAt);
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
    name: 'get_week',
    title: 'Планы на несколько дней',
    description: 'Задачи и платежи на несколько дней: «что на этой неделе» — from = "this_week", «планы на следующую неделю» — from = "next_week", иначе дата первого дня и число дней.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'this_week (с сегодня до воскресенья), next_week (с понедельника по воскресенье), today, tomorrow или ГГГГ-ММ-ДД. По умолчанию сегодня.' },
        days: { type: 'number', description: 'Сколько дней, 1–14. По умолчанию 7 (для this_week — до воскресенья).' },
      },
      additionalProperties: false,
    },
    readOnly: true,
    run: (data, input, ctx) => {
      // Недели считаем сами: модели путаются, какой день — понедельник следующей недели
      const toSunday = 7 - weekday(ctx.today);
      const from = input.from === 'this_week' ? ctx.today : input.from === 'next_week' ? addDays(ctx.today, toSunday) : date(input.from, ctx);
      const fallback = input.from === 'this_week' ? toSunday : 7;
      const days = Math.min(14, Math.max(1, Math.round(typeof input.days === 'number' && input.from !== 'this_week' && input.from !== 'next_week' ? input.days : fallback)));
      const to = addDays(from, days - 1);
      const dues = openDues(data.all<Payment>('fin_payments'), data.all<Tx>('fin_tx'), from, days).filter((d) => d.date <= to);
      const out: string[] = [];
      for (let i = 0; i < days; i++) {
        const d = addDays(from, i);
        const items = dayItems(data, d, ctx);
        const pays = dues.filter((p) => p.date === d);
        if (!items.length && !pays.length) continue;
        out.push(`${formatDateDay(d)}${d === ctx.today ? ' (сегодня)' : ''}:`, ...items.map((t) => `  ${itemLine(t)}`), ...pays.map((p) => `  платёж: ${p.name} ${rub(p.amount)}`));
      }
      return out.length ? out.join('\n') : `С ${formatDateDay(from)} по ${formatDateDay(to)} ничего не запланировано.`;
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
        reminders: remindersSchema,
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
      const asked = reminderSpecs(input.reminders);
      if (asked?.length && !time) throw new ToolError('Напоминание ставится к времени: передайте time');
      const reminders = time ? (asked ?? [{ offsetMin: 0 as const }]) : [];
      const task: Task = { ...meta(ctx), title, date: d, ...(time ? { time } : {}), ...(reminders.length ? { reminders } : {}), priority, done: false, order, tags, wasInBacklog: d === null, postponedCount: 0 };
      data.put('tasks', task);
      return `Добавил «${title}» ${d ? `на ${formatDateDay(d)}${time ? ` в ${time}` : ''}` : 'в бэклог'}${reminderText(reminders)}${priority !== 'medium' ? `, приоритет ${PRIORITY_LABEL[priority]}` : ''}.`;
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
    description:
      'Найти продукт в справочнике и своих продуктах пользователя; значения на 100 г. Ищите по названию вместе с маркой, если пользователь её назвал. ' +
      'Если нужного продукта (той же марки и вида) нет — не подставляйте похожий: сами найдите КБЖУ на 100 г в интернете и передайте их в log_food.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    readOnly: true,
    run: (data, input) => {
      const found = searchFoods(foodList(data), text(input.query, 'query', 80), 10);
      return found.length ? found.map((f) => `${f.name}: ${macroText(f)} на 100 г${f.portion ? `, порция ${String(f.portion)} г` : ''}`).join('\n') : 'В справочнике нет. Найдите КБЖУ этого продукта на 100 г в интернете (сайт производителя или магазина) и передайте их в log_food — продукт сохранится в «Мои продукты».';
    },
  },
  {
    name: 'log_food',
    title: 'Записать еду',
    description:
      'Записать съеденное. Без КБЖУ ищется продукт в справочнике и своих продуктах по названию. Если там нет именно этого продукта, найдите его КБЖУ на 100 г в интернете ' +
      'и передайте kcal, protein, fat, carbs (и brand) — продукт сохранится в «Мои продукты» и в следующий раз найдётся сам. Граммы не названы — возьмите обычную порцию и скажите об этом.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Что съели, как назвал пользователь (без марки)' },
        brand: { type: 'string', description: 'Марка или производитель, если известны' },
        grams: { type: 'number', description: 'Сколько граммов' },
        meal: { type: 'string', enum: [...MEAL_IDS], description: 'Приём пищи' },
        date: dateSchema,
        kcal: { type: 'number', description: 'Ккал на 100 г, если продукта нет в справочнике (найдите в интернете); не указаны — посчитаются по БЖУ' },
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
      const brand = optText(input.brand, 80);
      let food: FoodRef;
      let saved = false;
      // Продукт с точно таким названием (и маркой) уже есть в справочнике или «Моих продуктах» — берём его значения,
      // а не числа нейросети: она путает, например, варёную гречку с сухой
      const known = foodList(data).find((f) => norm(f.name) === norm(name) && (!brand || norm(f.brand ?? '') === norm(brand)));
      if (known) food = known;
      else if (['kcal', 'protein', 'fat', 'carbs'].some((k) => input[k] !== undefined)) {
        const m = (k: string) => (input[k] === undefined ? 0 : num(input[k], k, 0, 1000));
        const [protein, fat, carbs] = [m('protein'), m('fat'), m('carbs')];
        // Калорий нет — считаем по БЖУ, как в форме своего продукта
        const kcal = input.kcal === undefined ? kcalFromMacros(protein, fat, carbs) : Math.round(num(input.kcal, 'kcal', 0, 1000));
        const macros = { kcal, protein, fat, carbs };
        // Сохраняем в «Мои продукты», чтобы в следующий раз он нашёлся без интернета; тот же продукт обновляем
        const same = data.all<FoodItem>('food_items').find((f) => f.kind === 'product' && norm(f.name) === norm(name) && norm(f.brand ?? '') === norm(brand ?? ''));
        const item = data.put<FoodItem>('food_items', { ...(same ?? meta(ctx)), updatedAt: ctx.now, name, kind: 'product', ...macros, ...(brand ? { brand } : {}) });
        saved = !same;
        food = { id: item.id, name, ...macros, ...(brand ? { brand } : {}) };
      } else {
        const found = searchFoods(foodList(data), brand ? `${name} ${brand}` : name, 5);
        const exact = found.find((f) => norm(f.name) === norm(name));
        const one = exact ?? (found.length === 1 ? found[0] : undefined);
        if (!one) throw new ToolError(found.length ? `Уточните продукт: ${found.map((f) => f.name).join(', ')}. Выберите подходящий по смыслу (на обед обычно готовый, например варёный) и вызовите log_food снова с точным названием, или передайте КБЖУ на 100 г.` : 'Продукт не найден в справочнике. Передайте КБЖУ на 100 г (kcal, protein, fat, carbs).');
        food = one;
      }
      const d = date(input.date, ctx);
      const { id: foodId, name: foodName, brand: foodBrand, portion, kcal, protein, fat, carbs } = food;
      data.put<FoodEntry>('food_entries', { ...meta(ctx), date: d, meal, grams, foodId, name: foodName, kcal, protein, fat, carbs, ...(foodBrand ? { brand: foodBrand } : {}), ...(portion ? { portion } : {}) });
      return `${mealLabel(meal)}: ${foodName}${foodBrand ? ` (${foodBrand})` : ''} ${String(grams)} г — ${macroText(portionOf(food, grams))}.${saved ? ' Продукт сохранён в «Мои продукты».' : ''}`;
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
      'Изменить задачу: название, заметку, дату, время, напоминания, метки, приоритет. У повторяющейся меняется только этот день (метки и напоминания — только у всей серии). ' +
      'Заметка заменяется целиком: чтобы дописать, передайте старый текст вместе с новым.' + ONLY_ON_REQUEST,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string', description: 'Новая заметка целиком; пустая строка убирает заметку' },
        date: { type: 'string', description: 'today, tomorrow, ГГГГ-ММ-ДД или backlog (только для обычной задачи)' },
        time: { type: 'string', description: 'ЧЧ:ММ; пустая строка убирает время (только у обычной задачи)' },
        reminders: remindersSchema,
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
          // Время появилось впервые — напоминание в момент начала, как в приложении
          if (time && !t.time && remindersOf(t).length === 0 && input.reminders === undefined) t.reminders = [{ offsetMin: 0 }];
          if (time) t.time = time;
          else {
            delete t.time;
            delete t.reminders;
            delete t.reminder;
          }
          changed.push('время');
        }
        const rem = reminderSpecs(input.reminders);
        if (rem) {
          if (rem.length && !t.time) throw new ToolError('Напоминание ставится к времени: сначала задайте time');
          t.reminders = rem;
          delete t.reminder;
          changed.push('напоминания');
        }
        if (Array.isArray(input.tags)) { t.tags = input.tags.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^#/, '').trim().toLowerCase()).filter(Boolean).slice(0, 10); changed.push('метки'); }
        if (priority) { t.priority = priority; changed.push('приоритет'); }
        if (changed.length === 0) throw new ToolError('Нечего менять');
        data.put('tasks', t);
        return `«${t.title}»: изменено — ${changed.join(', ')}.`;
      }
      if (Array.isArray(input.tags)) throw new ToolError('Метки повторяющейся задачи меняются только у всей серии, в приложении');
      if (input.reminders !== undefined) throw new ToolError('Напоминания повторяющейся задачи меняются только у всей серии, в приложении');
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

// ---------- замеры тела ----------

const metricText = (id: keyof typeof METRICS, v: number) => `${METRICS[id].label} ${String(v)} ${METRICS[id].unit}`;
const metricProps = Object.fromEntries(METRIC_IDS.map((id) => [id, { type: 'number', description: `${METRICS[id].label}, ${METRICS[id].unit}` }]));

const BODY_TOOLS: readonly Tool[] = [
  {
    name: 'get_measurements',
    title: 'Замеры тела',
    description: 'Вес и обхваты пользователя: последнее значение каждого показателя с изменением и последние замеры по датам.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Сколько последних замеров показать, по умолчанию 10' } }, additionalProperties: false },
    readOnly: true,
    run: (data, input) => {
      const entries = data.all<BodyEntry>('gym_body').sort((a, b) => (a.date < b.date ? 1 : -1));
      if (!entries.length) return 'Замеров пока нет.';
      const limit = input.limit === undefined ? 10 : Math.round(num(input.limit, 'limit', 1, 100));
      return [
        'Последние значения:',
        ...summaries(entries).map((x) => `  ${metricText(x.id, x.last.value)} (${x.last.date})${x.prev ? `, ${formatDelta(x.last.value - x.prev.value)} к ${x.prev.date}` : ''}${x.first.date !== x.last.date ? `, с ${x.first.date}: ${formatDelta(x.last.value - x.first.value)}` : ''}`),
        '',
        'Замеры:',
        ...entries.slice(0, limit).map((e) => `  ${e.date}: ${METRIC_IDS.filter((id) => e.values[id] !== undefined).map((id) => metricText(id, e.values[id] ?? 0)).join(', ')}`),
      ].join('\n');
    },
  },
  {
    name: 'log_measurement',
    title: 'Записать замер',
    description: 'Записать вес и/или обхваты (см). Передавайте только названные показатели: за этот день они дописываются к уже записанным.',
    inputSchema: { type: 'object', properties: { date: dateSchema, ...metricProps }, additionalProperties: false },
    readOnly: false,
    run: (data, input, ctx) => {
      const d = date(input.date, ctx);
      const values: BodyValues = {};
      for (const id of METRIC_IDS) if (input[id] !== undefined) values[id] = Math.round(num(input[id], id, 1, 500) * 100) / 100;
      if (!Object.keys(values).length) throw new ToolError(`Нужен хотя бы один показатель: ${METRIC_IDS.join(', ')}`);
      const cur = data.get<BodyEntry>('gym_body', bodyId(d));
      const next = data.put<BodyEntry>('gym_body', { ...(cur ?? { id: bodyId(d), createdAt: ctx.now }), updatedAt: ctx.now, date: d, values: { ...cur?.values, ...values } });
      return `Замер ${d}: ${METRIC_IDS.filter((id) => next.values[id] !== undefined).map((id) => metricText(id, next.values[id] ?? 0)).join(', ')}.`;
    },
  },
  {
    name: 'delete_measurement',
    title: 'Удалить замер',
    description: 'Удалить замер за дату целиком или отдельные показатели (metrics).' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { date: dateSchema, metrics: { type: 'array', items: { type: 'string', enum: [...METRIC_IDS] } } }, required: ['date'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const d = date(input.date, ctx);
      const cur = data.get<BodyEntry>('gym_body', bodyId(d));
      if (!cur) throw new ToolError(`За ${d} замера нет.`);
      const drop = Array.isArray(input.metrics) ? METRIC_IDS.filter((id) => (input.metrics as unknown[]).includes(id)) : [];
      const values = Object.fromEntries(Object.entries(cur.values).filter(([id]) => !drop.some((x) => x === id))) as BodyValues;
      if (drop.length && Object.keys(values).length) {
        data.put<BodyEntry>('gym_body', { ...cur, values, updatedAt: ctx.now });
        return `Убрал из замера ${d}: ${drop.map((id) => METRICS[id].label.toLowerCase()).join(', ')}.`;
      }
      data.put<BodyEntry>('gym_body', { ...cur, deletedAt: ctx.now, updatedAt: ctx.now });
      return `Удалил замер за ${d}.`;
    },
  },
];

export const TOOLS: readonly Tool[] = [...BASE_TOOLS, ...EDIT_TOOLS, ...HABIT_TOOLS, ...CATEGORY_TOOLS, ...BODY_TOOLS, ...GYM_TOOLS, ...SUMMARY_TOOLS];
