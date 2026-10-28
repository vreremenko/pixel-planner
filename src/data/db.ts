import Dexie, { type EntityTable } from 'dexie';
import type {
  AchievementUnlock,
  Habit,
  HabitLog,
  OccurrenceOverride,
  RecurringSeries,
  ReminderLog,
  Settings,
  Task,
  XpEvent,
} from '../domain/types';

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class PlannerDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  series!: EntityTable<RecurringSeries, 'id'>;
  overrides!: EntityTable<OccurrenceOverride, 'id'>;
  habits!: EntityTable<Habit, 'id'>;
  habitLogs!: EntityTable<HabitLog, 'id'>;
  xp!: EntityTable<XpEvent, 'id'>;
  achievements!: EntityTable<AchievementUnlock, 'id'>;
  reminderLogs!: EntityTable<ReminderLog, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'pixel-planner') {
    super(name);
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
  }
}

export const db = new PlannerDB();

export const SYNC_TABLES = [
  'tasks',
  'series',
  'overrides',
  'habits',
  'habitLogs',
  'xp',
  'achievements',
  'reminderLogs',
  'settings',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
