export interface HttpReq {
  method: string;
  /** Путь после /api/, например `sync` или `devices/<id>/schedule` */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  /** Адрес клиента (для ограничения числа попыток входа). */
  ip?: string;
}

export interface HttpRes {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface SyncRow {
  seq: number;
  t: string;
  id: string;
  u: number;
  d: string;
}

export interface SyncIn {
  t: string;
  id: string;
  u: number;
  d: string;
}

export interface Device {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  now: number;
}

export interface ScheduleItem {
  key: string;
  fireAt: number;
  kind: string;
  ref: string;
  date: string;
  title: string;
  body: string;
}

export interface User {
  id: string;
  email: string;
  passHash: string;
}

export interface DueRow extends ScheduleItem {
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Хранилище. Реализации: YDB (боевая) и в памяти (тесты). Все методы атомарны сами по себе. */
export interface Store {
  /** Записи пространства с seq > after, по возрастанию seq, не больше limit. */
  syncPull(space: string, after: number, limit: number): Promise<SyncRow[]>;
  /** Принять записи; запись заменяет существующую, только если её u строго больше. */
  syncPush(space: string, records: SyncIn[]): Promise<void>;
  syncDelete(space: string): Promise<void>;

  /** Кому принадлежит устройство (null — такого устройства нет). */
  deviceOwner(id: string): Promise<string | null>;
  /** Все устройства пользователя. */
  devicesOfUser(userId: string): Promise<string[]>;
  deviceGet(id: string): Promise<{ endpoint: string; p256dh: string; auth: string } | null>;
  deviceUpsert(d: Device): Promise<void>;
  /** Удалить устройство и всё его расписание. */
  deviceDelete(id: string): Promise<void>;
  /** Заменить будущее расписание устройства; уже отправленные с тем же ключом не дублируются. */
  scheduleReplace(deviceId: string, items: ScheduleItem[], now: number): Promise<void>;
  reminderSnooze(deviceId: string, item: ScheduleItem): Promise<void>;
  dueReminders(now: number, limit: number): Promise<DueRow[]>;
  markSent(rows: { deviceId: string; key: string }[]): Promise<void>;

  /** false — такая почта уже зарегистрирована. */
  userCreate(u: User & { now: number }): Promise<boolean>;
  userByEmail(email: string): Promise<User | null>;
  userById(id: string): Promise<User | null>;
  userSetPassword(id: string, passHash: string): Promise<void>;
  /** Удалить пользователя со всеми его данными: синхронизацией, устройствами, напоминаниями, сессиями. */
  userDelete(id: string): Promise<void>;

  sessionCreate(s: { tokenHash: string; userId: string; device: string; now: number }): Promise<void>;
  /** Владелец сессии; сессия, не использовавшаяся дольше maxIdleMs, не считается. Заодно помечает время использования. */
  sessionUser(tokenHash: string, now: number, maxIdleMs: number): Promise<string | null>;
  sessionDelete(tokenHash: string): Promise<void>;
  /** Закрыть все сессии пользователя, кроме одной (смена пароля). */
  sessionsDeleteOthers(userId: string, keepTokenHash: string): Promise<void>;
}
