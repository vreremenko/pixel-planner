/* Напоминания планировщика: задачи, повторы, привычки и утренняя сводка. */
import { addDays, dateOf } from '../../core/domain/dates';
import { settingsRepo } from '../../core/data/repo';
import type { PlannedReminder, ReminderProvider } from '../../core/notifications/types';
import { planReminders, summaryText } from './domain/reminders';
import { isScheduled } from './domain/streaks';
import { buildOccurrences } from './domain/recurrence';
import { habitLogRepo, habitRepo, overrideRepo, seriesRepo, taskRepo } from './data/repo';
import { completeFromReminder } from './data/quickActions';

async function summaryBody(date: string): Promise<string> {
  const [tasks, series, overrides, habits] = await Promise.all([taskRepo.byDate(date), seriesRepo.all(), overrideRepo.all(), habitRepo.all()]);
  const occ = buildOccurrences(series, overrides, date, date, date).filter((o) => o.status === 'pending');
  const h = habits.filter((x) => !x.archived && isScheduled(x.schedule, date));
  return summaryText(tasks.filter((t) => !t.done).length + occ.length, h.length);
}

async function plan(from: Date, to: Date): Promise<PlannedReminder[]> {
  const settings = await settingsRepo.get();
  const fromDate = addDays(dateOf(from), -1);
  const toDate = dateOf(to);
  // Напоминание «за день» срабатывает накануне: задачи берём с запасом на день вперёд
  const taskTo = addDays(toDate, 1);
  const [tasks, series, overrides, habits, logs] = await Promise.all([
    taskRepo.byDateRange(fromDate, taskTo),
    seriesRepo.all(),
    overrideRepo.all(),
    habitRepo.all(),
    habitLogRepo.byDateRange(fromDate, toDate),
  ]);
  // «Сегодня» = начало окна, чтобы экземпляры внутри окна были pending, а не missed.
  const occurrences = buildOccurrences(series, overrides, fromDate, taskTo, fromDate);
  const planned = planReminders({
    tasks,
    occurrences,
    habits,
    habitDone: new Set(logs.map((l) => `${l.habitId}:${l.date}`)),
    settings,
    from,
    to,
  });
  return Promise.all(planned.map(async (r) => (r.kind === 'summary' ? { ...r, body: await summaryBody(r.date) } : r)));
}

export const plannerReminders: ReminderProvider = {
  kinds: ['task', 'occurrence', 'habit', 'summary'],
  plan,
  complete: completeFromReminder,
  // Счётной привычке нужно число — его вводят на экране привычек
  openPath: () => '/habits',
};
