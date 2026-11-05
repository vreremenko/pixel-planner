/* Реестр таблиц модулей (без React и без обращения к базе): из него ядро собирает схему IndexedDB. */
import { PLANNER_TABLES } from './planner/tables';
import { GYM_TABLES } from './gym/tables';
import { FOOD_TABLES } from './food/tables';
import { FINANCE_TABLES } from './finance/tables';

export const MODULE_TABLES: Record<string, string> = { ...PLANNER_TABLES, ...GYM_TABLES, ...FOOD_TABLES, ...FINANCE_TABLES };
