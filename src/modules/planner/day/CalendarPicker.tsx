import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import s from './Day.module.css';
import { Button, Modal, cx } from '../../../core/ui';
import { addDays, addMonths, endOfMonth, MONTHS, parseLocalDate, startOfMonth, startOfWeek, WEEKDAYS_SHORT } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { taskRepo } from '../data/repo';
import { loadOccurrences } from '../data/hooks';

interface Props {
  open: boolean;
  value: LocalDate;
  todayDate: LocalDate;
  onPick: (d: LocalDate) => void;
  onClose: () => void;
  title?: string;
  /** Дни раньше / позже недоступны. */
  min?: LocalDate;
  max?: LocalDate;
}

export function CalendarPicker({ open, value, todayDate, onPick, onClose, title = 'Выбор дня', min, max }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(value));
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const days: LocalDate[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const marks = useLiveQuery(async () => {
    const m = new Map<LocalDate, { all: number; done: number }>();
    const add = (d: LocalDate, done: boolean) => {
      const e = m.get(d) ?? { all: 0, done: 0 };
      e.all++;
      if (done) e.done++;
      m.set(d, e);
    };
    for (const t of await taskRepo.byDateRange(gridStart, gridEnd)) if (t.date) add(t.date, t.done);
    for (const o of await loadOccurrences(gridStart, gridEnd, todayDate)) add(o.date, o.status === 'done');
    return m;
  }, [gridStart, gridEnd, todayDate]);

  const { y, m } = parseLocalDate(month);
  return (
    <Modal open={open} onClose={onClose} title={title} accent="var(--c-task)">
      <div className={s.calHead}>
        <Button small icon="left" label="Предыдущий месяц" onClick={() => setMonth(addMonths(month, -1))} />
        <h3 aria-live="polite">
          {MONTHS[m - 1]} {y}
        </h3>
        <Button small icon="right" label="Следующий месяц" onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <div className={s.calGrid} role="grid" aria-label="Календарь">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className={s.calDow} role="columnheader">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const mk = marks?.get(d);
          return (
            <button
              key={d}
              type="button"
              disabled={(min !== undefined && d < min) || (max !== undefined && d > max)}
              className={cx(s.calDay, !d.startsWith(month.slice(0, 7)) && s.other, d === todayDate && s.today, d === value && s.selected)}
              onClick={() => {
                onPick(d);
                onClose();
              }}
              aria-label={`${d}${mk ? `, задач: ${mk.all}` : ''}`}
              aria-current={d === todayDate ? 'date' : undefined}
            >
              {parseLocalDate(d).day}
              {mk && <span className={cx(s.dot, mk.done === mk.all && s.allDone)} />}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <Button
          small
          onClick={() => {
            onPick(todayDate);
            onClose();
          }}
        >
          Сегодня
        </Button>
      </div>
    </Modal>
  );
}
