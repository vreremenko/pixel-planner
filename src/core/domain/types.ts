/* Общие типы ядра: даты, поля синхронизации, напоминания, настройки. Типы разделов — в их модулях. */
/** Локальная календарная дата 'YYYY-MM-DD' (без часового пояса). */
export type LocalDate = string;
/** Локальное «настенное» время 'HH:mm'. */
export type LocalTime = string;
/** 0 = понедельник … 6 = воскресенье (ISO). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Общие поля всех сущностей — задел под синхронизацию (курсор по updatedAt + tombstones). */
export interface SyncMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** id = key напоминания. */
export interface ReminderLog extends SyncMeta {
  key: string;
  /** Вид напоминания; его понимает модуль, который его запланировал (например 'task', 'habit'). */
  kind: string;
  /** На что указывает напоминание (id задачи, ключ экземпляра…) — трактует модуль. */
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
  /** Выключенные разделы (id модулей): их нет в меню и на сводке. */
  modulesOff: string[];
  /** Пункты нижнего меню телефона между «Сводкой» и «Ещё» (пути, до 3). */
  mobileNav: string[];
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
  modulesOff: [],
  mobileNav: ['/day', '/habits', '/backlog'],
};
