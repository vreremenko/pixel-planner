/* Напоминания тренировок: сообщение об автоматическом завершении забытой тренировки. */
import { settingsRepo } from '../../core/data/repo';
import type { PlannedReminder, ReminderProvider } from '../../core/notifications/types';
import { IDLE_MS, lastActivity } from './domain/logic';
import { tables, workoutRepo } from './data/repo';

function planned(id: string, title: string, date: string, last: number, setsDone: number): PlannedReminder {
  return {
    key: `workout:${id}:${String(last)}`,
    kind: 'workout',
    ref: id,
    date,
    fireAt: last + IDLE_MS,
    title: 'Тренировка завершена',
    body: `«${title}» закрыта автоматически: полчаса без действий. Подходов записано: ${String(setsDone)}.`,
  };
}

async function plan(from: Date, to: Date, account = false): Promise<PlannedReminder[]> {
  if (!account && !(await settingsRepo.get()).notificationsEnabled) return [];
  const out: PlannedReminder[] = [];
  for (const w of await workoutRepo.all()) {
    // Идущая тренировка закроется через полчаса после последнего действия; уже закрытая сама — сообщение ещё нужно показать
    if (w.finishedAt && !w.auto) continue;
    // Удалённые подходы тоже считаются действием
    const all = await tables.sets.where('workoutId').equals(w.id).toArray();
    const setsDone = all.filter((s) => !s.deletedAt && s.done).length;
    if (setsDone === 0) continue;
    const last = w.finishedAt ?? lastActivity(w, all);
    const r = planned(w.id, w.title, w.date, last, setsDone);
    if (r.fireAt >= from.getTime() && r.fireAt < to.getTime()) out.push(r);
  }
  return out;
}

export const gymReminders: ReminderProvider = {
  kinds: ['workout'],
  plan,
  openPath: () => '/gym',
};
