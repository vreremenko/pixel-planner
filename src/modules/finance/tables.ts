/* Таблицы IndexedDB раздела «Финансы». Все синхронизируются (см. src/shared/syncTables.ts). */
export const FINANCE_TABLES = {
  fin_accounts: 'id, updatedAt',
  fin_categories: 'id, updatedAt',
  fin_tx: 'id, date, updatedAt',
  fin_payments: 'id, updatedAt',
  fin_goals: 'id, updatedAt',
  fin_prefs: 'id, updatedAt',
};
