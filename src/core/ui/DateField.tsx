import { useState } from 'react';
import s from './Calendar.module.css';
import { CalendarPicker, type CalendarProps } from './CalendarPicker';
import { Field } from './Field';
import { formatDateDay, today } from '../domain/dates';
import type { LocalDate } from '../domain/types';

interface Props extends Pick<CalendarProps, 'min' | 'max' | 'accent' | 'loadMarks'> {
  label: string;
  value: LocalDate;
  onChange: (d: LocalDate) => void;
}

/** Поле даты: показывает «Пт, 30 октября» и открывает общий календарь (родное поле даты на телефоне обрезает число). */
export function DateField({ label, value, onChange, ...calendar }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label}>
      <button type="button" className={s.dateField} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {formatDateDay(value)}
      </button>
      {open && <CalendarPicker open value={value} todayDate={today()} title={label} {...calendar} onPick={onChange} onClose={() => setOpen(false)} />}
    </Field>
  );
}
