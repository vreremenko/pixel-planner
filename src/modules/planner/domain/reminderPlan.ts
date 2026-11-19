/*
 * Напоминания планировщика по готовым данным (без базы): задачи, повторы, привычки, утренняя сводка.
 * Одна функция для приложения и сервера: сервер пересчитывает расписание сам, когда данные меняет нейросеть.
 * Время — в текущем часовом поясе процесса (на сервере его выставляют под пользователя).
 */
import { addDays, dateOf } from '../../../core/domain/dates';
import type { Settings } from '../../../core/domain/types';
import type { PlannedReminder } from '../../../core/notifications/types';
import { buildOccurrences } from './recurrence';
import { planReminders, summaryText } from './reminders';
import { isScheduled } from './streaks';
import type { Habit, HabitLog, OccurrenceOverride, RecurringSeries, Task } from './types';

export interface PlannerRows {
  tasks: readonly Task[];
  series: readonly RecurringSeries[];
  overrides: readonly OccurrenceOverride[];
  habits: readonly Habit[];
  habitLogs: readonly HabitLog[];
}

/** Какие даты задач нужны для окна: напоминание «за день» срабатывает накануне, поэтому с запасом на день. */
export function plannerWindow(from: Date, to: Date): { fromDate: string; toDate: string; taskTo: string } {
  const toDate = dateOf(to);
  return { fromDate: addDays(dateOf(from), -1), toDate, taskTo: addDays(toDate, 1) };
}

export function planPlanner(rows: PlannerRows, settings: Settings, from: Date, to: Date): PlannedReminder[] {
  const { fromDate, toDate, taskTo } = plannerWindow(from, to);
  const tasks = rows.tasks.filter((t) => t.date !== null && t.date >= fromDate && t.date <= taskTo);
  const logs = rows.habitLogs.filter((l) => l.date >= fromDate && l.date <= toDate);
  // «Сегодня» = начало окна, чтобы экземпляры внутри окна были pending, а не missed.
  const occurrences = buildOccurrences([...rows.series], [...rows.overrides], fromDate, taskTo, fromDate);
  const planned = planReminders({ tasks, occurrences, habits: rows.habits, habitDone: new Set(logs.map((l) => `${l.habitId}:${l.date}`)), settings, from, to });
  return planned.map((r) => {
    if (r.kind !== 'summary') return r;
    const open = tasks.filter((t) => t.date === r.date && !t.done).length + occurrences.filter((o) => o.date === r.date && o.status === 'pending').length;
    const habits = rows.habits.filter((h) => !h.archived && isScheduled(h.schedule, r.date)).length;
    return { ...r, body: summaryText(open, habits) };
  });
}
