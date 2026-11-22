/*
 * Расписание напоминаний аккаунта по его записям синхронизации — без базы и без браузера.
 * Им пользуется сервер: после изменений через нейросеть и периодически, чтобы напоминания приходили,
 * даже если приложение давно не открывали. Приложение считает то же самое теми же функциями разделов.
 */
import { DEFAULT_SETTINGS, pickAccountSettings, type AppPrefs, type Settings, type SyncMeta } from '../core/domain/types';
import type { PlannedReminder } from '../core/notifications/types';
import { planFinance } from './finance/domain/reminderPlan';
import type { Category, Payment, Tx } from './finance/domain/types';
import type { FoodEntry, FoodPrefs } from './food/domain/types';
import type { BodyEntry } from './gym/domain/body';
import { digestText, planWeekly, type DigestData } from './weeklyDigest';
import { planGym } from './gym/domain/reminderPlan';
import type { Workout, WorkoutSet } from './gym/domain/types';
import { planPlanner } from './planner/domain/reminderPlan';
import type { Habit, HabitLog, OccurrenceOverride, RecurringSeries, Task } from './planner/domain/types';

/** Записи аккаунта по таблицам (AccountData помощника). */
export interface AccountRows {
  all<T extends SyncMeta>(table: string): T[];
  allWithDeleted<T extends SyncMeta>(table: string): T[];
}

/** Настройки для расписания аккаунта: общие (тихие часы, сводка) из app_prefs, уведомления включены. */
export function accountSettings(rows: AccountRows): Settings {
  const prefs = rows.all<AppPrefs>('app_prefs')[0];
  return { ...DEFAULT_SETTINGS, ...(prefs ? pickAccountSettings(prefs) : {}), notificationsEnabled: true };
}

/** Все напоминания аккаунта в окне [from, to), по времени. Время — в часовом поясе процесса. */
export function planAccount(rows: AccountRows, from: Date, to: Date): PlannedReminder[] {
  const settings = accountSettings(rows);
  return [
    ...planPlanner(
      {
        tasks: rows.all<Task>('tasks'),
        series: rows.all<RecurringSeries>('series'),
        overrides: rows.all<OccurrenceOverride>('overrides'),
        habits: rows.all<Habit>('habits'),
        habitLogs: rows.all<HabitLog>('habitLogs'),
      },
      settings,
      from,
      to,
    ),
    ...planGym(rows.all<Workout>('gym_workouts'), rows.allWithDeleted<WorkoutSet>('gym_sets'), from, to),
    ...planFinance(rows.all<Payment>('fin_payments'), rows.all<Tx>('fin_tx'), from, to),
    ...planWeekly(settings, from, to, (end) => digestText(digestData(rows), end)),
  ].sort((a, b) => a.fireAt - b.fireAt);
}

/** Данные для «Итогов недели» из записей аккаунта. */
export function digestData(rows: AccountRows): DigestData {
  return {
    tasks: rows.all<Task>('tasks'),
    series: rows.all<RecurringSeries>('series'),
    overrides: rows.all<OccurrenceOverride>('overrides'),
    habits: rows.all<Habit>('habits'),
    habitLogs: rows.all<HabitLog>('habitLogs'),
    txs: rows.all<Tx>('fin_tx'),
    categories: rows.all<Category>('fin_categories'),
    workouts: rows.all<Workout>('gym_workouts'),
    sets: rows.all<WorkoutSet>('gym_sets'),
    food: rows.all<FoodEntry>('food_entries'),
    foodGoalKcal: rows.all<FoodPrefs>('food_prefs')[0]?.goal?.kcal,
    body: rows.all<BodyEntry>('gym_body'),
  };
}
