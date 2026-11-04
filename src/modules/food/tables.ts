/* Таблицы IndexedDB раздела «Питание». Все синхронизируются (см. src/shared/syncTables.ts). */
export const FOOD_TABLES = {
  food_items: 'id, updatedAt',
  food_entries: 'id, date, updatedAt',
  food_prefs: 'id, updatedAt',
};
