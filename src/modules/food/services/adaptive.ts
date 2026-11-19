/* Запуск подстройки нормы: по данным устройства, раз в день и только когда данные уже догнались с сервера. */
import { addDays } from '../../../core/domain/dates';
import { loadSession } from '../../../core/auth/session';
import { hasPulled } from '../../../core/sync/manager';
import { entryRepo, prefsRepo } from '../data/repo';
import { weights } from '../data/weight';
import { adaptGoal, type Adaptation } from '../domain/adaptive';

/** Проверить и применить; возвращает изменение для уведомления или null. */
export async function runAdaptive(today: string): Promise<Adaptation | null> {
  const prefs = await prefsRepo.get();
  if (!prefs.adaptive || !prefs.goal || !prefs.profile) return null;
  // С аккаунтом ждём синхронизации: иначе устройство подстроит норму по старым данным поверх свежей
  if ((await loadSession()) !== null && !hasPulled()) return null;
  const [entries, points] = await Promise.all([entryRepo.byDateRange(addDays(today, -22), today), weights()]);
  const r = adaptGoal({ profile: prefs.profile, goal: prefs.goal, entries, weights: points, today, adaptedAt: prefs.adaptedAt });
  if (!r) return null;
  // Без сообщения — обновился только вес в профиле: пересчётом это не считаем
  await prefsRepo.patch({ goal: r.goal, profile: r.profile, ...(r.note ? { adaptedAt: today, adaptNote: r.note } : {}) });
  return r.note ? r : null;
}
