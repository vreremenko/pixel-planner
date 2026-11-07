/* Напоминания, общие для всех разделов: ядро показывает и рассылает, а что и когда напомнить — решают модули. */
import type { LocalDate, ReminderLog } from '../domain/types';

export interface PlannedReminder {
  key: string;
  /** Вид напоминания; его понимает модуль-источник ('task', 'habit'…). */
  kind: string;
  /** На что указывает напоминание (id задачи и т.п.) — для действия «Выполнено». */
  ref: string;
  date: LocalDate;
  fireAt: number;
  title: string;
  body: string;
}

/** Информационное напоминание (сводка): без кнопок «Выполнено/Отложить» и без списка пропущенных. */
export const INFO_KIND = 'summary';
/** Сообщение без действий «Выполнено/Отложить»: утренняя сводка, автозавершение тренировки, срок платежа. */
export const isInfoKind = (kind: string): boolean => kind === INFO_KIND || kind === 'workout' || kind === 'payment';

export type ReminderRef = Pick<ReminderLog, 'kind' | 'ref' | 'date'>;

/** То, что модуль даёт ядру напоминаний. */
export interface ReminderProvider {
  /** Виды напоминаний модуля. */
  kinds: readonly string[];
  /** Напоминания со сроком в [from, to) с готовым текстом; модуль сам учитывает настройки (тихие часы и т.п.). */
  /** account — расписание для сервера: строится для всего аккаунта, независимо от выключателя на этом устройстве. */
  plan(from: Date, to: Date, account?: boolean): Promise<PlannedReminder[]>;
  /** «Выполнено» из уведомления; false — так нельзя (нужно открыть приложение). */
  complete?(r: ReminderRef): Promise<boolean>;
  /** Куда вести пользователя, если complete вернул false. */
  openPath?(r: ReminderRef): string;
}
