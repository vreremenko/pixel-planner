/*
 * Реестр разделов. Новый раздел = папка в src/modules/<id> с manifest.ts + строка здесь
 * (+ его таблицы в tables.ts, напоминания в reminders.ts, синхронизируемые таблицы в src/shared/syncTables.ts).
 */
import type { ModuleManifest } from '../core/module';
import { plannerModule } from './planner/manifest';

const ALL: readonly ModuleManifest[] = [plannerModule];

/** Разделы этой сборки: черновики — только при разработке. */
export const MODULES: readonly ModuleManifest[] = ALL.filter((m) => m.status !== 'draft' || import.meta.env.DEV);
