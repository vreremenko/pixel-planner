import Dexie, { type EntityTable } from 'dexie';
import type {
  Habit,
  HabitLog,
  OccurrenceOverride,
  RecurringSeries,
  ReminderLog,
  Settings,
  Task,
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
    // 2: геймификация убрана — браузер удалит таблицы опыта и достижений
    this.version(2).stores({ xp: null, achievements: null });
  }
}

export const db = new PlannerDB();
