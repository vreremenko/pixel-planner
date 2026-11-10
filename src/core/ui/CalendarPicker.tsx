import { useState, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import s from './Calendar.module.css';
import { Button } from './Button';
import { Modal } from './Modal';
import { cx } from './cx';
import { addDays, addMonths, endOfMonth, MONTHS, parseLocalDate, startOfMonth, startOfWeek, WEEKDAYS_SHORT } from '../domain/dates';
import type { LocalDate } from '../domain/types';

/** Отметки под числами: сколько дел в дне и сколько из них сделано. */
export type DayMarks = Map<LocalDate, { all: number; done: number }>;

export interface CalendarProps {
  open: boolean;
  value: LocalDate;
  todayDate: LocalDate;
  onPick: (d: LocalDate) => void;
  onClose: () => void;
  title?: string;
  /** Дни раньше / позже недоступны. */
  min?: LocalDate;
  max?: LocalDate;
  /** Цвет раздела (CSS-переменная токена). */
  accent?: string;
  /** Раздел может подсветить дни точками (планировщик — дни с задачами). */
  loadMarks?: (from: LocalDate, to: LocalDate, todayDate: LocalDate) => Promise<DayMarks>;
}

const noMarks = (): Promise<DayMarks> => Promise.resolve(new Map<LocalDate, { all: number; done: number }>());

export function CalendarPicker({ open, value, todayDate, onPick, onClose, title = 'Выбор дня', min, max, accent = 'var(--c-task)', loadMarks = noMarks }: CalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(value));
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const days: LocalDate[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const marks = useLiveQuery(() => loadMarks(gridStart, gridEnd, todayDate), [gridStart, gridEnd, todayDate, loadMarks]);

  const { y, m } = parseLocalDate(month);
  return (
    <Modal open={open} onClose={onClose} title={title} accent={accent}>
      <div className={s.calHead}>
        <Button small icon="left" label="Предыдущий месяц" onClick={() => setMonth(addMonths(month, -1))} />
        <h3 aria-live="polite">
          {MONTHS[m - 1]} {y}
        </h3>
        <Button small icon="right" label="Следующий месяц" onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <div className={s.calGrid} role="grid" aria-label="Календарь" style={{ '--cal-accent': accent } as CSSProperties}>
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
          disabled={(min !== undefined && todayDate < min) || (max !== undefined && todayDate > max)}
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
