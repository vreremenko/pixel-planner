import type { LocalDate, SyncMeta, Weekday } from '../../../core/domain/types';
import type { MuscleId } from './muscles';

/** Что записывается в подходе: вес×повторы, только повторы (свой вес), время, дистанция и время. */
export type Tracking = 'weight_reps' | 'reps' | 'time' | 'distance_time';

export const GROUPS = {
  chest: 'Грудь',
  back: 'Спина',
  shoulders: 'Плечи',
  arms: 'Руки',
  legs: 'Ноги',
  core: 'Пресс',
  cardio: 'Кардио',
} as const;
export type ExerciseGroup = keyof typeof GROUPS;

/** Упражнение: встроенное (из справочника) или своё. */
export interface ExerciseDef {
  id: string;
  name: string;
  group: ExerciseGroup;
  primary: MuscleId[];
  secondary: MuscleId[];
  tracking: Tracking;
  technique: string[];
  custom?: boolean;
}

/** Своё упражнение пользователя (встроенные в базе не хранятся). */
export interface CustomExercise extends SyncMeta, Omit<ExerciseDef, 'id' | 'custom'> {}

export interface ProgramItem {
  exerciseId: string;
  sets: number;
  /** Целевые повторы, свободной строкой: «8–12». */
  reps?: string;
  weight?: number;
  /** Отдых после подхода, сек; нет — из настроек. */
  restSec?: number;
}

/** День программы («Грудь + трицепс»). */
export interface Program extends SyncMeta {
  name: string;
  order: number;
  items: ProgramItem[];
  /** Дни недели тренировки (0 = Пн … 6 = Вс). Пусто или нет поля — без расписания («на будущее»). */
  days?: Weekday[];
}

export interface Workout extends SyncMeta {
  date: LocalDate;
  startedAt: number;
  finishedAt?: number;
  programId?: string;
  title: string;
}

export interface WorkoutSet extends SyncMeta {
  workoutId: string;
  exerciseId: string;
  date: LocalDate;
  /** Порядок в тренировке: упражнения идут по порядку первого подхода. */
  order: number;
  weight?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  rpe?: number;
  done: boolean;
  /** Отдых после подхода из программы, сек. */
  restSec?: number;
}

/** Настройки раздела, одни на все устройства аккаунта (id = 'prefs'). */
export interface GymPrefs extends SyncMeta {
  restTimer: { on: boolean; sec: number };
  rpe: boolean;
}

export const DEFAULT_PREFS: Omit<GymPrefs, keyof SyncMeta> = { restTimer: { on: true, sec: 90 }, rpe: false };
