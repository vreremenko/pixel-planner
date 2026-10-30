import { REMINDER_OFFSETS, type ReminderOffset, type ReminderSpec } from './types';

/** Сколько напоминаний можно задать одной задаче. */
export const MAX_REMINDERS = 5;

/** Порядок, в котором предлагаются значения для нового напоминания (самые ходовые — первыми). */
const SUGGEST_ORDER: readonly ReminderOffset[] = [30, 60, 5, 1440, 0];

export function reminderLabel(offsetMin: number): string {
  if (offsetMin === 0) return 'В момент начала';
  if (offsetMin === 60) return 'За час';
  if (offsetMin === 1440) return 'За день';
  return `За ${String(offsetMin)} минут`;
}

/** Коротко для строки задачи: «−30м», «−1ч», «−1д»; в момент начала — пусто. */
export function reminderShort(offsetMin: number): string {
  if (offsetMin === 0) return '';
  if (offsetMin === 1440) return '−1д';
  if (offsetMin === 60) return '−1ч';
  return `−${String(offsetMin)}м`;
}

/**
 * Напоминания элемента. Раньше хранилось одно поле `reminder`; новые данные пишутся в `reminders`.
 * Читаем оба, поэтому старые задачи и старые резервные копии работают без миграции.
 */
export function remindersOf(x: { reminders?: readonly ReminderSpec[] | undefined; reminder?: ReminderSpec | undefined }): ReminderSpec[] {
  if (x.reminders !== undefined) return normalizeReminders(x.reminders);
  return x.reminder ? normalizeReminders([x.reminder]) : [];
}

/** Без повторов и недопустимых значений, не больше MAX_REMINDERS, по убыванию (самое раннее — первым). */
export function normalizeReminders(list: readonly ReminderSpec[] | undefined): ReminderSpec[] {
  const seen = new Set<number>();
  for (const r of list ?? []) {
    if ((REMINDER_OFFSETS as readonly number[]).includes(r.offsetMin)) seen.add(r.offsetMin);
  }
  return [...seen]
    .sort((a, b) => b - a)
    .slice(0, MAX_REMINDERS)
    .map((offsetMin) => ({ offsetMin: offsetMin as ReminderOffset }));
}

/** Значение для нового напоминания: первое из ходовых, которого ещё нет; null — все уже выбраны. */
export function nextFreeOffset(used: readonly number[]): ReminderOffset | null {
  return SUGGEST_ORDER.find((o) => !used.includes(o)) ?? null;
}
