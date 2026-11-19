/* Запуск подстройки нормы: по данным устройства, раз в день и только когда данные уже догнались с сервера. */
import { addDays } from '../../../core/domain/dates';
import { loadSession } from '../../../core/auth/session';
import { hasPulled } from '../../../core/sync/manager';
import { db } from '../../../core/data/db';
import { alive } from '../../../core/data/repo';
import type { SyncMeta } from '../../../core/domain/types';
import { entryRepo, prefsRepo } from '../data/repo';
import { adaptGoal, type Adaptation } from '../domain/adaptive';

/** Строка «Замеров»: нужен только вес. */
interface BodyRow extends SyncMeta {
  date: string;
  values: { weight?: number };
}

/** Проверить и применить; возвращает изменение для уведомления или null. */
export async function runAdaptive(today: string): Promise<Adaptation | null> {
  const prefs = await prefsRepo.get();
  if (!prefs.adaptive || !prefs.goal || !prefs.profile) return null;
  // С аккаунтом ждём синхронизации: иначе устройство подстроит норму по старым данным поверх свежей
  if ((await loadSession()) !== null && !hasPulled()) return null;
  // Вес — из «Замеров» (таблица раздела тренировок); читаем её через базу, не завися от самого раздела
  const [entries, body] = await Promise.all([entryRepo.byDateRange(addDays(today, -22), today), db.table<BodyRow, string>('gym_body').toArray()]);
  const weights = body.filter(alive).flatMap((b) => (b.values.weight === undefined ? [] : [{ date: b.date, value: b.values.weight }]));
  const r = adaptGoal({ profile: prefs.profile, goal: prefs.goal, entries, weights, today, adaptedAt: prefs.adaptedAt });
  if (!r) return null;
  await prefsRepo.patch({ goal: r.goal, profile: r.profile, adaptedAt: today, adaptNote: r.note });
  return r;
}
