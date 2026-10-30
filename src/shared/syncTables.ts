/*
 * Какие таблицы синхронизируются с сервером. Общий файл клиента и сервера: сервер принимает
 * записи только этих таблиц. Новая синхронизируемая таблица модуля добавляется сюда.
 */
export const SYNC_TABLES = [
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
] as const;
