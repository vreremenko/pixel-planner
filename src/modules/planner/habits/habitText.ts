import { WEEKDAYS_SHORT } from '../../../core/domain/dates';
import type { Habit } from '../domain/types';

export function scheduleText(h: Habit): string {
  return h.schedule.type === 'daily'
    ? 'Каждый день'
    : h.schedule.days.length === 7
      ? 'Каждый день'
      : [...h.schedule.days].sort().map((d) => WEEKDAYS_SHORT[d]).join(' ');
}
