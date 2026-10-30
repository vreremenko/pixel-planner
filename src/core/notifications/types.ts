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

export type ReminderRef = Pick<ReminderLog, 'kind' | 'ref' | 'date'>;

/** То, что модуль даёт ядру напоминаний. */
export interface ReminderProvider {
  /** Виды напоминаний модуля. */
  kinds: readonly string[];
  /** Напоминания со сроком в [from, to) с готовым текстом; модуль сам учитывает настройки (тихие часы и т.п.). */
  plan(from: Date, to: Date): Promise<PlannedReminder[]>;
  /** «Выполнено» из уведомления; false — так нельзя (нужно открыть приложение). */
  complete?(r: ReminderRef): Promise<boolean>;
  /** Куда вести пользователя, если complete вернул false. */
  openPath?(r: ReminderRef): string;
}
