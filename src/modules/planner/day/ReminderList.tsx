import s from './Day.module.css';
import { Button, Field, inputClass } from '../../../core/ui';
import { MAX_REMINDERS, nextFreeOffset, reminderLabel } from '../domain/reminderSpecs';
import { REMINDER_CHOICES, type ReminderOffset } from '../domain/types';

interface Props {
  value: ReminderOffset[];
  onChange: (value: ReminderOffset[]) => void;
  /** Нет времени задачи — напоминать «за N минут» не от чего. */
  disabled: boolean;
}

/** Список напоминаний: нажатие на «+» добавляет ещё одно поле (до MAX_REMINDERS), каждое можно убрать. */
export function ReminderList({ value, onChange, disabled }: Props) {
  const next = nextFreeOffset(value);
  const canAdd = !disabled && value.length < MAX_REMINDERS && next !== null;

  return (
    <Field label={`Напоминания (до ${String(MAX_REMINDERS)})`}>
      <div role="group" aria-label="Напоминания">
        {disabled && <p className={s.rHint}>Укажите время задачи — тогда можно добавить напоминания.</p>}
        {value.map((offset, i) => (
          <div key={i} className={s.rRow}>
            <select
              className={inputClass}
              style={{ flex: 1, minWidth: 0 }}
              value={offset}
              disabled={disabled}
              aria-label={`Напоминание ${String(i + 1)}`}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? (Number(e.target.value) as ReminderOffset) : x)))}
            >
              {/* Уже выбранные в других полях значения не предлагаем: повтор не имеет смысла.
                  Старое значение, которого больше нет в списке (за 15 минут), показываем, пока его не сменят */}
              {(REMINDER_CHOICES.includes(offset) ? REMINDER_CHOICES : [...REMINDER_CHOICES, offset].sort((a, b) => a - b))
                .filter((o) => o === offset || !value.includes(o))
                .map((o) => (
                  <option key={o} value={o}>
                    {reminderLabel(o)}
                  </option>
                ))}
            </select>
            <Button small variant="ghost" icon="close" label={`Убрать напоминание ${String(i + 1)}`} disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className={s.rRow}>
          <Button small icon="plus" disabled={!canAdd} onClick={() => next !== null && onChange([...value, next])}>
            Напоминание
          </Button>
          {value.length > 0 && (
            <span className={s.rCount} aria-live="polite">
              {value.length}/{MAX_REMINDERS}
            </span>
          )}
        </div>
      </div>
    </Field>
  );
}
