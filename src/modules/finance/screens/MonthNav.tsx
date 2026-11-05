import { Button } from '../../../core/ui';
import { addMonths } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { monthLabel } from '../domain/stats';
import s from './Finance.module.css';

export function MonthNav({ month, onChange }: { month: LocalDate; onChange: (m: LocalDate) => void }) {
  return (
    <div className={s.monthNav}>
      <Button small variant="ghost" icon="left" label="Предыдущий месяц" onClick={() => onChange(addMonths(month, -1))} />
      <span>{monthLabel(month)}</span>
      <Button small variant="ghost" icon="right" label="Следующий месяц" onClick={() => onChange(addMonths(month, 1))} />
    </div>
  );
}
