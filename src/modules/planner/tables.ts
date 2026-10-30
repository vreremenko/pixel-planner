/* Таблицы IndexedDB планировщика: имя → индексы Dexie. У синхронизируемых обязателен индекс updatedAt. */
export const PLANNER_TABLES = {
  tasks: 'id, date, updatedAt',
  series: 'id, updatedAt',
  overrides: 'id, seriesId, date, movedTo, updatedAt',
  habits: 'id, updatedAt',
  habitLogs: 'id, habitId, date, updatedAt',
};
