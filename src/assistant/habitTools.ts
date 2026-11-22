/* Действия помощника с самими привычками: список, создать, изменить, пауза, в архив, удалить. Отметки — mark_habit в tools.ts. */
import { addDays } from '../core/domain/dates';
import { HABIT_ICONS } from '../core/ui/icons';
import { isCountHabit, type Habit, type HabitLog, type HabitSchedule, type HabitTracking } from '../modules/planner/domain/types';
import { currentPause, withPause, withoutPause } from '../modules/planner/domain/streaks';
import type { AccountData } from './data';
import { ONLY_ON_REQUEST, TIME_RE, ToolError, WEEKDAY_NAMES, daysSchema, meta, optText, pick, text, weekdays, type Tool, type ToolContext } from './toolkit';

const scheduleText = (s: HabitSchedule) => (s.type === 'daily' || s.days.length === 7 ? 'каждый день' : s.days.map((d) => WEEKDAY_NAMES[d]).join(', '));
const trackingText = (h: Habit) => (isCountHabit(h) ? `счётная, ${h.tracking.unit}` : 'отметка');
const findHabit = (data: AccountData, query: unknown) => pick(data.all<Habit>('habits'), text(query, 'habit'), (h) => h.name, 'привычку');

function schedule(v: unknown): HabitSchedule {
  const days = weekdays(v);
  return days.length === 0 || days.length === 7 ? { type: 'daily' } : { type: 'days', days };
}

function reminder(v: unknown): string | undefined {
  const t = optText(v, 5);
  if (t && !TIME_RE.test(t)) throw new ToolError('reminder_time: ЧЧ:ММ');
  return t;
}

const iconSchema = { type: 'string', enum: [...HABIT_ICONS], description: 'Значок, необязательно' };

export const HABIT_TOOLS: readonly Tool[] = [
  {
    name: 'list_habits',
    title: 'Привычки',
    description: 'Все привычки: расписание, тип (отметка или счётная с единицей), напоминание, сколько дней выполнено за последние 7 и 30 дней. Архивные — отдельно.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true,
    run: (data, _input, ctx: ToolContext) => {
      const habits = data.all<Habit>('habits').sort((a, b) => a.order - b.order);
      if (!habits.length) return 'Привычек пока нет.';
      const logs = data.all<HabitLog>('habitLogs');
      const since = (n: number) => addDays(ctx.today, -n + 1);
      const line = (h: Habit) => {
        const mine = logs.filter((l) => l.habitId === h.id);
        const in7 = mine.filter((l) => l.date >= since(7) && l.date <= ctx.today).length;
        const in30 = mine.filter((l) => l.date >= since(30) && l.date <= ctx.today).length;
        const p = currentPause(h, ctx.today);
        const paused = p ? `, на паузе${p.from > ctx.today ? ` с ${p.from}` : ''}${p.to ? ` по ${p.to}` : ' без срока'}` : '';
        return `${h.name}: ${scheduleText(h.schedule)}, ${trackingText(h)}${h.reminderTime ? `, напоминание в ${h.reminderTime}` : ''}${paused}; выполнено ${String(in7)} из 7 и ${String(in30)} из 30 дней`;
      };
      const active = habits.filter((h) => !h.archived);
      const archived = habits.filter((h) => h.archived);
      return [...active.map(line), ...(archived.length ? ['', 'В архиве:', ...archived.map((h) => h.name)] : [])].join('\n');
    },
  },
  {
    name: 'add_habit',
    title: 'Новая привычка',
    description: 'Создать привычку. Счётная (стаканы воды, страницы, отжимания) — укажите unit; иначе это простая отметка за день.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        days: daysSchema,
        unit: { type: 'string', description: 'Единица для счётной привычки: «стаканов», «страниц», «раз»' },
        reminder_time: { type: 'string', description: 'Напоминание ЧЧ:ММ, необязательно' },
        icon: iconSchema,
      },
      required: ['name'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const name = text(input.name, 'name', 80);
      const all = data.all<Habit>('habits');
      if (all.some((h) => h.name.toLowerCase() === name.toLowerCase())) throw new ToolError(`Привычка «${name}» уже есть.`);
      const unit = optText(input.unit, 30);
      const tracking: HabitTracking = unit ? { kind: 'count', unit } : { kind: 'check' };
      const time = reminder(input.reminder_time);
      const icon = HABIT_ICONS.find((i) => i === input.icon) ?? 'star';
      const order = all.reduce((m, h) => Math.max(m, h.order), 0) + 1;
      const h = data.put<Habit>('habits', { ...meta(ctx), name, icon, schedule: schedule(input.days), tracking, archived: false, order, ...(time ? { reminderTime: time } : {}) });
      return `Добавил привычку «${h.name}»: ${scheduleText(h.schedule)}, ${trackingText(h)}${time ? `, напоминание в ${time}` : ''}.`;
    },
  },
  {
    name: 'update_habit',
    title: 'Изменить привычку',
    description: 'Переименовать привычку, сменить дни, единицу, напоминание (пустая строка — убрать) или убрать в архив / вернуть.' + ONLY_ON_REQUEST,
    inputSchema: {
      type: 'object',
      properties: {
        habit: { type: 'string', description: 'Название привычки' },
        name: { type: 'string', description: 'Новое название' },
        days: daysSchema,
        unit: { type: 'string', description: 'Единица для счётной; пустая строка — сделать простой отметкой' },
        reminder_time: { type: 'string', description: 'ЧЧ:ММ; пустая строка — убрать напоминание' },
        archived: { type: 'boolean' },
        icon: iconSchema,
      },
      required: ['habit'],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const h = findHabit(data, input.habit);
      const { reminderTime: oldTime, ...rest } = h;
      const next: Habit = { ...rest, updatedAt: ctx.now };
      if (input.name !== undefined) next.name = text(input.name, 'name', 80);
      if (input.days !== undefined) next.schedule = schedule(input.days);
      if (input.unit !== undefined) {
        const unit = optText(input.unit, 30);
        next.tracking = unit ? { kind: 'count', unit } : { kind: 'check' };
      }
      const time = input.reminder_time === undefined ? oldTime : reminder(input.reminder_time);
      if (time) next.reminderTime = time;
      if (typeof input.archived === 'boolean') next.archived = input.archived;
      const icon = HABIT_ICONS.find((i) => i === input.icon);
      if (icon) next.icon = icon;
      data.put('habits', next);
      return `«${next.name}»: ${scheduleText(next.schedule)}, ${trackingText(next)}${next.reminderTime ? `, напоминание в ${next.reminderTime}` : ', без напоминания'}${next.archived ? ', в архиве' : ''}.`;
    },
  },
  {
    name: 'pause_habit',
    title: 'Пауза привычки',
    description:
      'Поставить привычку на паузу (отпуск, болезнь) с сегодняшнего дня: на days дней или без срока. В паузу привычка не ждёт отметок и не напоминает, серия не сгорает. resume: true — снять паузу с сегодня.',
    inputSchema: {
      type: 'object',
      properties: {
        habit: { type: 'string', description: 'Название привычки' },
        days: { type: 'integer', minimum: 1, maximum: 365, description: 'На сколько дней, включая сегодня; без поля — пока не вернут' },
        resume: { type: 'boolean', description: 'true — вернуть с паузы' },
      },
      required: ['habit'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const h = findHabit(data, input.habit);
      if (input.resume === true) {
        if (!currentPause(h, ctx.today)) return `«${h.name}» и так не на паузе.`;
        data.put('habits', { ...h, pauses: withoutPause(h, ctx.today), updatedAt: ctx.now });
        return `Вернул «${h.name}» с паузы — с сегодня снова ждёт отметок.`;
      }
      const days = input.days === undefined ? undefined : Number(input.days);
      if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 365)) throw new ToolError('days: от 1 до 365');
      const pauses = withPause(h, ctx.today, days);
      data.put('habits', { ...h, pauses, updatedAt: ctx.now });
      const until = pauses.at(-1)?.to;
      return `«${h.name}» на паузе ${until ? `по ${until} включительно` : 'без срока'}; серия сохранится.`;
    },
  },
  {
    name: 'delete_habit',
    title: 'Удалить привычку',
    description: 'Удалить привычку вместе с историей отметок. Если нужно сохранить историю — лучше update_habit с archived: true.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { habit: { type: 'string', description: 'Название привычки' } }, required: ['habit'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const h = findHabit(data, input.habit);
      data.put('habits', { ...h, deletedAt: ctx.now, updatedAt: ctx.now });
      return `Удалил привычку «${h.name}».`;
    },
  },
];
