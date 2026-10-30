import { reminderLogRepo } from '../data/repo';

export const SNOOZE_MS = 10 * 60_000;

/** Отложить напоминание на SNOOZE_MS: покажется снова (локально или через push-сервер). */
export async function snoozeReminder(key: string): Promise<void> {
  const log = await reminderLogRepo.get(key);
  if (!log) return;
  await reminderLogRepo.put({ ...log, snoozedUntil: Date.now() + SNOOZE_MS, acknowledged: true });
}
