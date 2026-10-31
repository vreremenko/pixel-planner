import { useState } from 'react';
import s from './Day.module.css';
import { Field } from '../../../core/ui';
import { formatDateDay } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { useToday } from '../../../core/shell/useToday';
import { CalendarPicker } from './CalendarPicker';

interface Props {
  label: string;
  value: LocalDate;
  onChange: (d: LocalDate) => void;
  min?: LocalDate;
  max?: LocalDate;
}

/** Поле даты: показывает «Пт, 30 октября» и открывает тот же календарь, что и на экране «День» (родное поле даты на телефоне обрезает число). */
export function DateField({ label, value, onChange, min, max }: Props) {
  const [open, setOpen] = useState(false);
  const todayDate = useToday();
  return (
    <Field label={label}>
      <button type="button" className={s.dateField} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {formatDateDay(value)}
      </button>
      {open && (
        <CalendarPicker
          open
          value={value}
          todayDate={todayDate}
          title={label}
          {...(min !== undefined ? { min } : {})}
          {...(max !== undefined ? { max } : {})}
          onPick={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </Field>
  );
}
