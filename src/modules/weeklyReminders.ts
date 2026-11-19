/* «Итоги недели» в приложении: те же функции, что на сервере, данные — из базы устройства. */
import { settingsRepo } from '../core/data/repo';
import type { PlannedReminder, ReminderProvider } from '../core/notifications/types';
import { categoryRepo, txRepo } from './finance/data/repo';
import { entryRepo, prefsRepo as foodPrefsRepo } from './food/data/repo';
import { bodyRepo, setRepo, workoutRepo } from './gym/data/repo';
import { habitLogRepo, habitRepo, overrideRepo, seriesRepo, taskRepo } from './planner/data/repo';
import { WEEKLY_KIND, digestText, planWeekly, type DigestData } from './weeklyDigest';
import { addDays } from '../core/domain/dates';

async function plan(from: Date, to: Date, account = false): Promise<PlannedReminder[]> {
  const stored = await settingsRepo.get();
  if (!account && !stored.notificationsEnabled) return [];
  // Сначала смотрим, попадает ли воскресенье в окно, и только тогда читаем данные недели
  const slots = planWeekly(stored, from, to, () => '');
  if (slots.length === 0) return [];
  const start = addDays(slots[0]?.date ?? '', -6);
  const end = slots.at(-1)?.date ?? start;
  const [tasks, series, overrides, habits, habitLogs, txs, categories, workouts, sets, food, foodPrefs, body] = await Promise.all([
    taskRepo.byDateRange(start, end),
    seriesRepo.all(),
    overrideRepo.all(),
    habitRepo.all(),
    habitLogRepo.byDateRange(start, end),
    txRepo.all(),
    categoryRepo.all(),
    workoutRepo.all(),
    setRepo.all(),
    entryRepo.byDateRange(start, end),
    foodPrefsRepo.get(),
    bodyRepo.all(),
  ]);
  const data: DigestData = { tasks, series, overrides, habits, habitLogs, txs, categories, workouts, sets, food, foodGoalKcal: foodPrefs.goal?.kcal, body, modulesOff: stored.modulesOff };
  return planWeekly(stored, from, to, (d) => digestText(data, d));
}

export const weeklyReminders: ReminderProvider = {
  kinds: [WEEKLY_KIND],
  plan,
  openPath: () => '/',
};
