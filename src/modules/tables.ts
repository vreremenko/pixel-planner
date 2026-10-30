/* Реестр таблиц модулей (без React и без обращения к базе): из него ядро собирает схему IndexedDB. */
import { PLANNER_TABLES } from './planner/tables';
import { GYM_TABLES } from './gym/tables';

export const MODULE_TABLES: Record<string, string> = { ...PLANNER_TABLES, ...GYM_TABLES };
