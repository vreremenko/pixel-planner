/*
 * Расписание напоминаний аккаунта по его записям синхронизации — без базы и без браузера.
 * Им пользуется сервер: после изменений через нейросеть и периодически, чтобы напоминания приходили,
 * даже если приложение давно не открывали. Приложение считает то же самое теми же функциями разделов.
 */
import { DEFAULT_SETTINGS, pickAccountSettings, type AppPrefs, type Settings, type SyncMeta } from '../core/domain/types';
import type { PlannedReminder } from '../core/notifications/types';
import { planFinance } from './finance/domain/reminderPlan';
import type { Payment, Tx } from './finance/domain/types';
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
  ].sort((a, b) => a.fireAt - b.fireAt);
}
