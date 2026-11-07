/*
 * Какие таблицы синхронизируются с сервером. Общий файл клиента и сервера: сервер принимает
 * записи только этих таблиц. Новая синхронизируемая таблица модуля добавляется сюда.
 */
export const SYNC_TABLES = [
  'app_prefs',
  'tasks',
  'series',
  'overrides',
  'habits',
  'habitLogs',
  'gym_exercises',
  'gym_programs',
  'gym_workouts',
  'gym_sets',
  'gym_prefs',
  'food_items',
  'food_entries',
  'food_prefs',
  'fin_accounts',
  'fin_categories',
  'fin_tx',
  'fin_payments',
  'fin_goals',
  'fin_prefs',
] as const;
