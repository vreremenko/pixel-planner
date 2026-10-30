/*
 * Действия, которые выполняются без UI: из кнопок системного уведомления (в service worker)
 * и из панели пропущенных напоминаний. Только репозитории — без React/Zustand.
 */
import type { ReminderLog } from '../../../core/domain/types';
import { overrideId } from '../domain/recurrence';
import { isCountHabit } from '../domain/types';
import { habitLogRepo, habitRepo, overrideRepo, taskRepo } from './repo';

/**
 * Отметить выполненным из уведомления. Возвращает false, если так сделать нельзя:
 * у счётной привычки нужно число, его вводят в приложении.
 */
export async function completeFromReminder(log: Pick<ReminderLog, 'kind' | 'ref' | 'date'>): Promise<boolean> {
  const now = Date.now();
  if (log.kind === 'task') {
    const t = await taskRepo.get(log.ref);
    if (!t || t.done) return true;
    await taskRepo.put({ ...t, done: true, doneAt: now });
  } else if (log.kind === 'occurrence') {
    const [seriesId, original] = splitKey(log.ref);
    const id = overrideId(seriesId, original);
    const cur = await overrideRepo.get(id);
    await overrideRepo.put({ ...(cur ?? { id, seriesId, date: original, createdAt: now, updatedAt: now }), status: 'done', doneAt: now });
  } else if (log.kind === 'habit') {
    const habit = await habitRepo.get(log.ref);
    if (habit && isCountHabit(habit)) return false;
    await habitLogRepo.set(log.ref, log.date, true);
  }
  return true;
}

/** Ключ экземпляра `${seriesId}:${date}`; id серии — uuid без двоеточий. */
function splitKey(key: string): [string, string] {
  const i = key.lastIndexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
}
