/* Реестр напоминаний модулей (без React): им пользуются планировщик, список пропущенных и service worker. */
import type { PlannedReminder, ReminderProvider, ReminderRef } from '../core/notifications/types';
import { financeReminders } from './finance/reminders';
import { gymReminders } from './gym/reminders';
import { plannerReminders } from './planner/reminders';

const PROVIDERS: readonly ReminderProvider[] = [plannerReminders, gymReminders, financeReminders];

const byKind = (kind: string) => PROVIDERS.find((p) => p.kinds.includes(kind));

/** Все напоминания всех модулей в окне [from, to), по времени. account — для сервера, см. ReminderProvider.plan. */
export async function planAll(from: Date, to: Date, account = false): Promise<PlannedReminder[]> {
  const lists = await Promise.all(PROVIDERS.map((p) => p.plan(from, to, account)));
  return lists.flat().sort((a, b) => a.fireAt - b.fireAt);
}

export async function completeReminder(r: ReminderRef): Promise<boolean> {
  return (await byKind(r.kind)?.complete?.(r)) ?? true;
}

export function reminderOpenPath(r: ReminderRef): string {
  return byKind(r.kind)?.openPath?.(r) ?? '/';
}
