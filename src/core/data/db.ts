import Dexie, { type EntityTable } from 'dexie';
import type { ReminderLog, Settings } from '../domain/types';
import { MODULE_TABLES } from '../../modules/tables';

export interface MetaEntry {
  key: string;
  value: unknown;
}

/** Таблицы ядра; таблицы разделов приходят из реестра модулей. */
const CORE_TABLES = {
  reminderLogs: 'id, fireAt, updatedAt',
  settings: 'id',
  meta: 'key',
};

/**
 * Версия схемы IndexedDB. Поднимать при любом изменении таблиц или индексов (свой модуль добавил
 * таблицу и т.п.) — иначе браузер не создаст новые таблицы. Тест-снимок схемы напомнит.
 */
export const SCHEMA_VERSION = 3;

export function schema(): Record<string, string> {
  return { ...CORE_TABLES, ...MODULE_TABLES };
}

export class AppDB extends Dexie {
  reminderLogs!: EntityTable<ReminderLog, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'pixel-planner') {
    super(name);
    // История версий: 1 — первая схема, 2 — убрана геймификация (таблицы xp и achievements удаляются)
    this.version(1).stores({
      tasks: 'id, date, updatedAt',
      series: 'id, updatedAt',
      overrides: 'id, seriesId, date, movedTo, updatedAt',
      habits: 'id, updatedAt',
      habitLogs: 'id, habitId, date, updatedAt',
      xp: 'id, date, updatedAt',
      achievements: 'id, updatedAt',
      reminderLogs: 'id, fireAt, updatedAt',
      settings: 'id',
      meta: 'key',
    });
    this.version(2).stores({ xp: null, achievements: null });
    this.version(SCHEMA_VERSION).stores(schema());
  }
}

export const db = new AppDB();
