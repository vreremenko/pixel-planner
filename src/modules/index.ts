/*
 * Реестр разделов. Новый раздел = папка в src/modules/<id> с manifest.ts + строка здесь
 * (+ его таблицы в tables.ts, напоминания в reminders.ts, синхронизируемые таблицы в src/shared/syncTables.ts).
 */
import type { ModuleManifest } from '../core/module';
import { plannerModule } from './planner/manifest';
import { gymModule } from './gym/manifest';
import { foodModule } from './food/manifest';
import { financeModule } from './finance/manifest';

const ALL: readonly ModuleManifest[] = [plannerModule, gymModule, foodModule, financeModule];

/** Разделы этой сборки: черновики — только при разработке. */
export const MODULES: readonly ModuleManifest[] = ALL.filter((m) => m.status !== 'draft' || import.meta.env.DEV);
