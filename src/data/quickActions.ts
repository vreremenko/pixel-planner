/*
 * Действия, которые выполняются без UI: из кнопок системного уведомления (в service worker)
 * и из панели пропущенных напоминаний. Только репозитории — без React/Zustand.
 */
import type { ReminderLog } from '../domain/types';
import { XP_OCCURRENCE, XP_TASK, habitXp, xpEventId } from '../domain/xp';
import { overrideId } from '../domain/recurrence';
import { isCountHabit } from '../domain/types';
import { habitLogRepo, habitRepo, overrideRepo, reminderLogRepo, taskRepo, xpRepo } from './repo';

export const SNOOZE_MS = 10 * 60_000;

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
    await xpRepo.award({ id: xpEventId('task', t.id), source: 'task', refKey: t.id, amount: XP_TASK[t.priority], date: t.date ?? log.date });
  } else if (log.kind === 'occurrence') {
    const [seriesId, original] = splitKey(log.ref);
    const id = overrideId(seriesId, original);
    const cur = await overrideRepo.get(id);
    await overrideRepo.put({ ...(cur ?? { id, seriesId, date: original, createdAt: now, updatedAt: now }), status: 'done', doneAt: now });
    await xpRepo.award({ id: xpEventId('occurrence', log.ref), source: 'occurrence', refKey: log.ref, amount: XP_OCCURRENCE, date: log.date });
  } else if (log.kind === 'habit') {
    const habit = await habitRepo.get(log.ref);
    if (habit && isCountHabit(habit)) return false;
    await habitLogRepo.set(log.ref, log.date, true);
    const ref = `${log.ref}:${log.date}`;
    await xpRepo.award({ id: xpEventId('habit', ref), source: 'habit', refKey: ref, amount: habitXp(1), date: log.date });
  }
  return true;
}

/** Ключ экземпляра `${seriesId}:${date}`; id серии — uuid без двоеточий. */
function splitKey(key: string): [string, string] {
  const i = key.lastIndexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
}

export async function snoozeReminder(key: string): Promise<void> {
  const log = await reminderLogRepo.get(key);
  if (!log) return;
  await reminderLogRepo.put({ ...log, snoozedUntil: Date.now() + SNOOZE_MS, acknowledged: true });
}

export async function acknowledge(key: string): Promise<void> {
  await reminderLogRepo.acknowledge([key]);
}
