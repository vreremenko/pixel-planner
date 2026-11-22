/*
 * «Итоги недели»: одно сообщение в воскресенье вечером — задачи, привычки, деньги, тренировки, питание, вес.
 * Только строки разделов, где за неделю что-то было, и без выключенных разделов.
 * Чистые функции: текст считают и приложение, и сервер (сервер — в момент отправки, чтобы попал весь день).
 */
import { addDays, dateOf, parseLocalDate, rangeDates, toInstant, weekday } from '../core/domain/dates';
import type { LocalDate, Settings } from '../core/domain/types';
import type { PlannedReminder } from '../core/notifications/types';
import { rub } from './finance/domain/money';
import { DEFAULT_CATEGORIES, type Category, type Tx } from './finance/domain/types';
import type { FoodEntry } from './food/domain/types';
import type { BodyEntry } from './gym/domain/body';
import type { Workout, WorkoutSet } from './gym/domain/types';
import { buildOccurrences } from './planner/domain/recurrence';
import { isScheduled } from './planner/domain/streaks';
import type { Habit, HabitLog, OccurrenceOverride, RecurringSeries, Task } from './planner/domain/types';

export const WEEKLY_KIND = 'weekly';

export interface DigestData {
  tasks: readonly Task[];
  series: readonly RecurringSeries[];
  overrides: readonly OccurrenceOverride[];
  habits: readonly Habit[];
  habitLogs: readonly HabitLog[];
  txs: readonly Tx[];
  categories: readonly Category[];
  workouts: readonly Workout[];
  sets: readonly WorkoutSet[];
  food: readonly FoodEntry[];
  foodGoalKcal?: number | undefined;
  body: readonly BodyEntry[];
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «16–22 ноября» или «28 октября – 3 ноября». */
export function weekLabel(start: LocalDate, end: LocalDate): string {
  const a = parseLocalDate(start);
  const b = parseLocalDate(end);
  return a.m === b.m ? `${String(a.day)}–${String(b.day)} ${MONTHS[b.m - 1] ?? ''}` : `${String(a.day)} ${MONTHS[a.m - 1] ?? ''} – ${String(b.day)} ${MONTHS[b.m - 1] ?? ''}`;
}

const num = (n: number) => Math.round(n).toLocaleString('ru-RU');
const kg = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Текст итогов за неделю, заканчивающуюся `end` (воскресенье). Пустая строка — за неделю ничего не было. */
export function digestText(data: DigestData, end: LocalDate): string {
  const start = addDays(end, -6);
  const inWeek = (d: string | null | undefined) => !!d && d >= start && d <= end;
  const lines: string[] = [];

  {
    const tasks = data.tasks.filter((t) => inWeek(t.date));
    const occ = buildOccurrences(data.series, data.overrides, start, end, addDays(end, 1));
    const total = tasks.length + occ.filter((o) => o.status !== 'skipped').length;
    const done = tasks.filter((t) => t.done).length + occ.filter((o) => o.status === 'done').length;
    if (total > 0) lines.push(`✅ Задачи: ${String(done)} из ${String(total)}`);

    const habits = data.habits.filter((h) => !h.archived);
    const doneSet = new Set(data.habitLogs.filter((l) => inWeek(l.date)).map((l) => `${l.habitId}:${l.date}`));
    let planned = 0;
    let hit = 0;
    for (const h of habits) {
      for (const d of rangeDates(start, end)) {
        if (!isScheduled(h.schedule, d)) continue;
        planned++;
        if (doneSet.has(`${h.id}:${d}`)) hit++;
      }
    }
    if (planned > 0) lines.push(`⭐ Привычки: ${String(Math.round((hit / planned) * 100))}% (${String(hit)} из ${String(planned)})`);
  }

  {
    const txs = data.txs.filter((t) => inWeek(t.date));
    const spent = txs.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0);
    const earned = txs.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0);
    if (spent > 0 || earned > 0) {
      const byCat = new Map<string, number>();
      for (const t of txs) if (t.kind === 'expense') byCat.set(t.categoryId ?? '', (byCat.get(t.categoryId ?? '') ?? 0) + t.amount);
      const [topId, topSum] = [...byCat].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
      const names = new Map<string, string>([...DEFAULT_CATEGORIES.map((c): [string, string] => [c.id, c.name]), ...data.categories.map((c): [string, string] => [c.id, c.name])]);
      const top = topSum > 0 && byCat.size > 1 ? `, больше всего — ${names.get(topId) ?? 'без категории'} (${rub(topSum)})` : '';
      lines.push([spent > 0 ? `💸 Расходы: ${rub(spent)}${top}` : '', earned > 0 ? `${spent > 0 ? '; доходы' : '💰 Доходы:'} ${rub(earned)}` : ''].join(''));
    }
  }

  {
    const ws = data.workouts.filter((w) => w.finishedAt && inWeek(w.date));
    if (ws.length > 0) {
      const ids = new Set(ws.map((w) => w.id));
      const sets = data.sets.filter((s) => s.done && !s.deletedAt && ids.has(s.workoutId)).length;
      lines.push(`🏋 Тренировки: ${String(ws.length)}, подходов ${String(sets)}`);
    }
    const body = [...data.body].filter((b) => b.values.weight !== undefined).sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = body.filter((b) => b.date <= end).at(-1);
    if (last && inWeek(last.date) && last.values.weight !== undefined) {
      const before = body.filter((b) => b.date < start).at(-1)?.values.weight;
      const delta = before === undefined ? '' : ` (${last.values.weight - before > 0 ? '+' : last.values.weight - before < 0 ? '−' : '±'}${kg(Math.abs(last.values.weight - before))} за неделю)`;
      lines.push(`⚖ Вес: ${kg(last.values.weight)} кг${delta}`);
    }
  }

  {
    const entries = data.food.filter((e) => inWeek(e.date));
    const days = new Set(entries.map((e) => e.date));
    if (days.size > 0) {
      const kcal = entries.reduce((a, e) => a + (e.kcal * e.grams) / 100, 0) / days.size;
      lines.push(`🍎 Питание: в среднем ${num(kcal)} ккал в день${data.foodGoalKcal ? ` (цель ${num(data.foodGoalKcal)})` : ''}, записано дней: ${String(days.size)} из 7`);
    }
  }

  return lines.join('\n');
}

/** Напоминания «Итоги недели» по воскресеньям в окне [from, to). `body` — текст за неделю, заканчивающуюся этой датой. */
export function planWeekly(settings: Pick<Settings, 'weeklyDigest'>, from: Date, to: Date, body: (end: LocalDate) => string): PlannedReminder[] {
  if (!settings.weeklyDigest.enabled) return [];
  const out: PlannedReminder[] = [];
  for (const d of rangeDates(addDays(dateOf(from), -1), dateOf(to))) {
    if (weekday(d) !== 6) continue;
    const fireAt = toInstant(d, settings.weeklyDigest.time).getTime();
    if (fireAt < from.getTime() || fireAt >= to.getTime()) continue;
    out.push({ key: `${WEEKLY_KIND}:${d}`, kind: WEEKLY_KIND, ref: d, date: d, fireAt, title: `Итоги недели, ${weekLabel(addDays(d, -6), d)}`, body: body(d) || 'На этой неделе записей не было. Новая неделя — новый старт!' });
  }
  return out;
}
