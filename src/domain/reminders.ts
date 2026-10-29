import { addDays, dateOf, minutesOf, rangeDates, timeOf, toInstant } from './dates';
import { remindersOf } from './reminderSpecs';
import { isScheduled } from './streaks';
import type {
  Habit,
  LocalDate,
  LocalTime,
  Occurrence,
  ReminderSpec,
  Settings,
  Task,
} from './types';

type ReminderKind = 'task' | 'occurrence' | 'habit' | 'summary';

export interface PlannedReminder {
  key: string;
  kind: ReminderKind;
  /** id задачи / ключ экземпляра / id привычки — для действия «Выполнено». */
  ref: string;
  date: LocalDate;
  fireAt: number;
  title: string;
  body: string;
}

export function inQuietHours(instant: Date, qh: Settings['quietHours']): boolean {
  if (!qh.enabled || qh.from === qh.to) return false;
  const m = minutesOf(timeOf(instant));
  const from = minutesOf(qh.from);
  const to = minutesOf(qh.to);
  return from < to ? m >= from && m < to : m >= from || m < to;
}

/** Если момент попадает в тихие часы — переносим на их окончание. */
export function applyQuietHours(instant: Date, qh: Settings['quietHours']): Date {
  if (!inQuietHours(instant, qh)) return instant;
  const d = dateOf(instant);
  const m = minutesOf(timeOf(instant));
  const from = minutesOf(qh.from);
  const endDate = from > minutesOf(qh.to) && m >= from ? addDays(d, 1) : d;
  return toInstant(endDate, qh.to);
}

export function reminderInstant(date: LocalDate, time: LocalTime, spec: ReminderSpec): Date {
  return new Date(toInstant(date, time).getTime() - spec.offsetMin * 60_000);
}

function offsetText(spec: ReminderSpec, time: LocalTime): string {
  return spec.offsetMin === 0 ? `Сейчас, ${time}` : `Через ${spec.offsetMin} мин, в ${time}`;
}

export interface ReminderInput {
  tasks: readonly Task[];
  occurrences: readonly Occurrence[];
  habits: readonly Habit[];
  habitDone: ReadonlySet<string>; // `${habitId}:${date}`
  settings: Settings;
  from: Date;
  to: Date;
}

/**
 * Все напоминания с моментом срабатывания в окне [from, to).
 * Время считается в текущем часовом поясе устройства (DST учитывается в toInstant).
 */
export function planReminders(input: ReminderInput): PlannedReminder[] {
  const { settings, from, to } = input;
  if (!settings.notificationsEnabled) return [];
  const out: PlannedReminder[] = [];
  const push = (r: Omit<PlannedReminder, 'fireAt'> & { at: Date }) => {
    const at = applyQuietHours(r.at, settings.quietHours).getTime();
    if (at >= from.getTime() && at < to.getTime()) {
      const { at: _at, ...rest } = r;
      out.push({ ...rest, fireAt: at });
    }
  };

  // Каждое напоминание — отдельное уведомление; ключ включает отступ, поэтому они не мешают друг другу
  for (const t of input.tasks) {
    if (t.deletedAt || t.done || !t.date || !t.time) continue;
    for (const spec of remindersOf(t)) {
      push({
        key: `task:${t.id}:${t.date}T${t.time}-${String(spec.offsetMin)}`,
        kind: 'task',
        ref: t.id,
        date: t.date,
        at: reminderInstant(t.date, t.time, spec),
        title: t.title,
        body: offsetText(spec, t.time),
      });
    }
  }
  for (const o of input.occurrences) {
    if (o.status !== 'pending' || !o.time) continue;
    for (const spec of o.reminders) {
      push({
        key: `occ:${o.key}:${o.date}T${o.time}-${String(spec.offsetMin)}`,
        kind: 'occurrence',
        ref: o.key,
        date: o.date,
        at: reminderInstant(o.date, o.time, spec),
        title: `↻ ${o.title}`,
        body: offsetText(spec, o.time),
      });
    }
  }
  // Привычки и сводка: перебираем даты окна (с запасом в день для тихих часов).
  const dates = rangeDates(addDays(dateOf(from), -1), dateOf(to));
  for (const h of input.habits) {
    if (h.deletedAt || h.archived || !h.reminderTime) continue;
    for (const d of dates) {
      if (!isScheduled(h.schedule, d) || input.habitDone.has(`${h.id}:${d}`)) continue;
      push({
        key: `habit:${h.id}:${d}`,
        kind: 'habit',
        ref: h.id,
        date: d,
        at: toInstant(d, h.reminderTime),
        title: `★ Квест: ${h.name}`,
        body: `Пора выполнить привычку (${h.reminderTime})`,
      });
    }
  }
  if (settings.morningSummary.enabled) {
    for (const d of dates) {
      push({
        key: `summary:${d}`,
        kind: 'summary',
        ref: d,
        date: d,
        at: toInstant(d, settings.morningSummary.time),
        title: 'Новый уровень дня!',
        body: '',
      });
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

export function summaryText(tasks: number, habits: number): string {
  if (tasks === 0 && habits === 0) return 'На сегодня ничего не запланировано. Свободная игра!';
  return `Задач: ${tasks}, квестов: ${habits}. Вперёд!`;
}
