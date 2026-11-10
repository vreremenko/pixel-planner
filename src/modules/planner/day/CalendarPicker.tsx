/* Календарь планировщика: общий календарь с точками в днях, где есть задачи. */
import type { ComponentProps } from 'react';
import { CalendarPicker as BaseCalendar, DateField as BaseDateField, type DayMarks } from '../../../core/ui';
import type { LocalDate } from '../../../core/domain/types';
import { taskRepo } from '../data/repo';
import { loadOccurrences } from '../data/hooks';

async function taskMarks(from: LocalDate, to: LocalDate, todayDate: LocalDate): Promise<DayMarks> {
  const m: DayMarks = new Map();
  const add = (d: LocalDate, done: boolean) => {
    const e = m.get(d) ?? { all: 0, done: 0 };
    e.all++;
    if (done) e.done++;
    m.set(d, e);
  };
  for (const t of await taskRepo.byDateRange(from, to)) if (t.date) add(t.date, t.done);
  for (const o of await loadOccurrences(from, to, todayDate)) add(o.date, o.status === 'done');
  return m;
}

export function CalendarPicker(props: Omit<ComponentProps<typeof BaseCalendar>, 'loadMarks' | 'accent'>) {
  return <BaseCalendar {...props} loadMarks={taskMarks} />;
}

export function DateField(props: Omit<ComponentProps<typeof BaseDateField>, 'loadMarks' | 'accent'>) {
  return <BaseDateField {...props} loadMarks={taskMarks} />;
}
