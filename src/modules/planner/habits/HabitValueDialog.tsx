import { useState } from 'react';
import { Button, Modal, TextInput, toast } from '../../../core/ui';
import { formatValue, parseValue } from '../domain/habitStats';
import { formatDateLong } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import type { Habit } from '../domain/types';
import { setHabitValue } from '../services/habits';

interface Props {
  habit: Habit;
  unit: string;
  date: LocalDate;
  /** Все записанные значения этой привычки — чтобы подставлять число при смене даты. */
  values: ReadonlyMap<LocalDate, number>;
  todayDate: LocalDate;
  onClose: () => void;
}

/** Ввод значения за выбранный день (сегодня, прошлые дни, правка записи). */
export function HabitValueDialog({ habit, unit, date: initialDate, values, todayDate, onClose }: Props) {
  const [date, setDate] = useState(initialDate);
  const [text, setText] = useState(() => {
    const v = values.get(initialDate);
    return v === undefined ? '' : formatValue(v);
  });
  const existing = values.get(date);
  const parsed = parseValue(text);
  const invalid = text.trim() !== '' && parsed === null;

  const pickDate = (d: LocalDate) => {
    if (!d || d > todayDate) return;
    setDate(d);
    const v = values.get(d);
    setText(v === undefined ? '' : formatValue(v));
  };

  const save = async (value: number) => {
    await setHabitValue(habit, date, value);
    toast(value > 0 ? `Записано: ${formatValue(value)} ${unit}` : 'Запись удалена', value > 0 ? 'check' : 'trash', value > 0 ? 'var(--c-habit)' : 'var(--c-warn)');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={habit.name}
      accent="var(--c-habit)"
      footer={
        <>
          {existing !== undefined && (
            <Button variant="danger" icon="trash" onClick={() => void save(0)}>
              Удалить запись
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="habit" icon="check" disabled={invalid || parsed === null || parsed === 0} onClick={() => parsed && void save(parsed)}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed) void save(parsed);
        }}
      >
        <TextInput label="День" type="date" value={date} max={todayDate} onChange={(e) => pickDate(e.target.value)} />
        <p style={{ margin: '-4px 0 12px', color: 'var(--c-text-dim)' }}>{formatDateLong(date)}</p>
        <TextInput
          label={`Сколько (${unit})`}
          inputMode="decimal"
          autoComplete="off"
          maxLength={12}
          data-autofocus
          data-select
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="например, 30"
          aria-invalid={invalid}
        />
        {invalid && <p style={{ margin: '-4px 0 0', color: 'var(--c-warn)' }}>Введите число, например 30 или 2,5</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
