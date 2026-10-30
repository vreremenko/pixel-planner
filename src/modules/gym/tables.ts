/* Таблицы IndexedDB раздела «Тренировки». Все синхронизируются (см. src/shared/syncTables.ts). */
export const GYM_TABLES = {
  gym_exercises: 'id, updatedAt',
  gym_programs: 'id, updatedAt',
  gym_workouts: 'id, date, updatedAt',
  gym_sets: 'id, workoutId, exerciseId, date, updatedAt',
  gym_prefs: 'id, updatedAt',
};
