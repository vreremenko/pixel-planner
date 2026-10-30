/*
 * Общие репозитории ядра и помощники для репозиториев модулей.
 * Все записи имеют updatedAt и мягкое удаление (deletedAt) — на этом держится синхронизация.
 */
import { db } from './db';
import type { ReminderLog, Settings, SyncMeta } from '../domain/types';
import { SYNC_TABLES } from '../../shared/syncTables';
import { DEFAULT_SETTINGS } from '../domain/types';
import { currentTimeZone } from '../domain/dates';

export const newId = (): string => crypto.randomUUID();
/** Запись существует и не удалена (удаление — tombstone с deletedAt, чтобы оно синхронизировалось). */
export const alive = <T extends SyncMeta>(x: T | undefined): x is T => x !== undefined && !x.deletedAt;

export function stamp<T extends Partial<SyncMeta>>(x: T): T & SyncMeta {
  const now = Date.now();
  return { ...x, id: x.id ?? newId(), createdAt: x.createdAt ?? now, updatedAt: now };
}

export const reminderLogRepo = {
  async get(key: string) {
    return db.reminderLogs.get(key);
  },
  async put(r: ReminderLog) {
    await db.reminderLogs.put({ ...r, updatedAt: Date.now() });
  },
  async unacknowledged(before: number) {
    return (await db.reminderLogs.where('fireAt').below(before).toArray()).filter(
      (r) => alive(r) && !r.acknowledged,
    );
  },
  async acknowledge(keys: string[]) {
    const now = Date.now();
    await db.reminderLogs.where('id').anyOf(keys).modify({ acknowledged: true, updatedAt: now });
  },
  async snoozed(after: number) {
    return (await db.reminderLogs.toArray()).filter(
      (r) => alive(r) && r.snoozedUntil !== undefined && r.snoozedUntil > after,
    );
  },
};

export const settingsRepo = {
  async get(): Promise<Settings> {
    const s = await db.settings.get('settings');
    return { ...DEFAULT_SETTINGS, timeZone: currentTimeZone(), ...s };
  },
  async patch(p: Partial<Omit<Settings, 'id'>>) {
    const cur = await this.get();
    await db.settings.put({ ...cur, ...p, id: 'settings', updatedAt: Date.now() });
  },
};

export const metaRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await db.meta.get(key))?.value as T | undefined;
  },
  async set(key: string, value: unknown) {
    await db.meta.put({ key, value });
  },
};

/** Есть ли в базе данные пользователя (любые синхронизируемые записи) — чтобы отличить новую установку. */
export async function hasUserData(): Promise<boolean> {
  for (const t of SYNC_TABLES) if ((await db.table(t).count()) > 0) return true;
  return false;
}
