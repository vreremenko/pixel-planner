/** Локальная календарная дата 'YYYY-MM-DD' (без часового пояса). */
export type LocalDate = string;
/** Локальное «настенное» время 'HH:mm'. */
export type LocalTime = string;
export type Priority = 'low' | 'medium' | 'high';
/** 0 = понедельник … 6 = воскресенье (ISO). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Общие поля всех сущностей — задел под синхронизацию (курсор по updatedAt + tombstones). */
export interface SyncMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export const REMINDER_OFFSETS = [0, 5, 15, 30, 60] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];
export interface ReminderSpec {
  offsetMin: ReminderOffset;
}

/** Пункт чек-листа задачи. У повторяющихся задач в шаблоне серии done всегда false. */
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Task extends SyncMeta {
  title: string;
  notes?: string;
  checklist?: ChecklistItem[];
  /** null — задача лежит в бэклоге («Инвентарь»). */
  date: LocalDate | null;
  time?: LocalTime;
  priority: Priority;
  done: boolean;
  doneAt?: number;
  order: number;
  tags: string[];
  /** Устаревшее поле (одно напоминание): читается через remindersOf, новые данные пишутся в reminders. */
  reminder?: ReminderSpec;
  /** Напоминания до начала (до 5, без повторов); нужны время задачи. */
  reminders?: ReminderSpec[];
  wasInBacklog: boolean;
  postponedCount: number;
}

export type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'until'; date: LocalDate }
  | { type: 'count'; count: number };

export type RecurrencePattern =
  | { freq: 'daily' }
  | { freq: 'weekdays' }
  | { freq: 'weekly'; days: Weekday[] }
  | { freq: 'interval'; everyDays: number }
  | { freq: 'monthly'; monthDay: number };

export type RecurrenceRule = RecurrencePattern & {
  start: LocalDate;
  end: RecurrenceEnd;
};

export interface RecurringSeries extends SyncMeta {
  title: string;
  notes?: string;
  /** Шаблон чек-листа: пункты одинаковы у всех экземпляров, отметки — по дням в override.checked. */
  checklist?: ChecklistItem[];
  time?: LocalTime;
  priority: Priority;
  tags: string[];
  /** Устаревшее поле: см. Task.reminder. */
  reminder?: ReminderSpec;
  reminders?: ReminderSpec[];
  rule: RecurrenceRule;
  splitFromId?: string;
}

export type OccurrencePatch = Partial<
  Pick<RecurringSeries, 'title' | 'notes' | 'checklist' | 'time' | 'priority' | 'reminder' | 'reminders'>
>;

/** Отклонения конкретного экземпляра от правила. id = `${seriesId}:${date}`. */
export interface OccurrenceOverride extends SyncMeta {
  seriesId: string;
  /** Исходная дата экземпляра по правилу. */
  date: LocalDate;
  status?: 'done' | 'skipped';
  doneAt?: number;
  patch?: OccurrencePatch;
  movedTo?: LocalDate;
  cancelled?: boolean;
  order?: number;
  /** id отмеченных пунктов чек-листа в этот день. */
  checked?: string[];
}

export type OccurrenceStatus = 'pending' | 'done' | 'skipped' | 'missed';

/** Экземпляр серии на конкретную дату — генерируется на лету, не хранится. */
export interface Occurrence {
  key: string;
  seriesId: string;
  originalDate: LocalDate;
  date: LocalDate;
  title: string;
  notes?: string;
  checklist?: ChecklistItem[];
  time?: LocalTime;
  priority: Priority;
  tags: string[];
  /** Напоминания этого экземпляра (уже с учётом правок «только эта»); пусто — нет. */
  reminders: ReminderSpec[];
  status: OccurrenceStatus;
  doneAt?: number;
  order: number;
}

export type HabitSchedule = { type: 'daily' } | { type: 'days'; days: Weekday[] };

/** check — просто отметка за день; count — за день записывается число (отжимания, километры…). */
export type HabitTracking = { kind: 'check' } | { kind: 'count'; unit: string };

export interface Habit extends SyncMeta {
  name: string;
  icon: string;
  schedule: HabitSchedule;
  /** Нет поля — старые привычки, они считаются «check». */
  tracking?: HabitTracking;
  reminderTime?: LocalTime;
  archived: boolean;
  order: number;
}

/** id = `${habitId}:${date}` */
export interface HabitLog extends SyncMeta {
  habitId: string;
  date: LocalDate;
  /** Значение за день у счётных привычек (> 0). */
  value?: number;
}

export const isCountHabit = (h: Pick<Habit, 'tracking'>): h is { tracking: { kind: 'count'; unit: string } } =>
  h.tracking?.kind === 'count';

export type XpSource = 'task' | 'occurrence' | 'habit' | 'achievement';

/** id детерминированный (`${source}:${refKey}`) => начисление идемпотентно. */
export interface XpEvent extends SyncMeta {
  source: XpSource;
  refKey: string;
  amount: number;
  date: LocalDate;
}

export interface AchievementUnlock extends SyncMeta {
  achievementId: string;
  unlockedAt: number;
}

/** id = key напоминания. */
export interface ReminderLog extends SyncMeta {
  key: string;
  kind: 'task' | 'occurrence' | 'habit' | 'summary';
  /** id задачи / ключ экземпляра / id привычки / дата сводки */
  ref: string;
  date: LocalDate;
  title: string;
  body: string;
  fireAt: number;
  firedAt?: number;
  snoozedUntil?: number;
  acknowledged: boolean;
}

export interface Settings {
  id: 'settings';
  updatedAt: number;
  notificationsEnabled: boolean;
  quietHours: { enabled: boolean; from: LocalTime; to: LocalTime };
  morningSummary: { enabled: boolean; time: LocalTime };
  soundEnabled: boolean;
  crtEffect: boolean;
  /** Режим «Для мамы»: светлая тема, крупный читаемый шрифт. Свой на каждом устройстве. */
  momMode: boolean;
  timeZone: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  updatedAt: 0,
  notificationsEnabled: false,
  quietHours: { enabled: false, from: '23:00', to: '07:00' },
  morningSummary: { enabled: false, time: '08:00' },
  soundEnabled: false,
  crtEffect: true,
  momMode: false,
  timeZone: 'UTC',
};
