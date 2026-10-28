import { useState } from 'react';
import s from './Habits.module.css';
import { Button, Field, Modal, MultiToggle, PixelIcon, Segmented, TextInput, toast } from '../../ui';
import { HABIT_ICONS } from '../../ui/icons';
import { WEEKDAYS_SHORT } from '../../domain/dates';
import type { Habit, Weekday } from '../../domain/types';
import { createHabit, deleteHabit, setArchived, updateHabit, type HabitDraft } from '../../services/habits';

const WD = WEEKDAYS_SHORT.map((label, i) => ({ value: i as Weekday, label }));

interface Props {
  habit: Habit | null; // null => новая
  onClose: () => void;
}

export function HabitEditor({ habit, onClose }: Props) {
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? 'star');
  const [days, setDays] = useState<Weekday[]>(habit?.schedule.type === 'days' ? habit.schedule.days : [0, 1, 2, 3, 4, 5, 6]);
  const [mode, setMode] = useState<'daily' | 'days'>(habit?.schedule.type ?? 'daily');
  const [time, setTime] = useState(habit?.reminderTime ?? '');
  const invalid = !name.trim() || (mode === 'days' && days.length === 0);

  const save = async () => {
    const d: HabitDraft = {
      name: name.trim(),
      icon,
      schedule: mode === 'daily' ? { type: 'daily' } : { type: 'days', days: [...days].sort() },
    };
    if (time) d.reminderTime = time;
    if (habit) await updateHabit(habit, d);
    else {
      await createHabit(d);
      toast('Новый квест принят!', 'star', 'var(--c-habit)');
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={habit ? 'Квест' : 'Новый квест'}
      accent="var(--c-habit)"
      footer={
        <>
          {habit && (
            <>
              <Button
                variant="danger"
                icon="trash"
                onClick={() => {
                  if (confirm(`Удалить привычку «${habit.name}» вместе с историей?`)) void deleteHabit(habit.id).then(onClose);
                }}
              >
                Удалить
              </Button>
              <Button onClick={() => void setArchived(habit, !habit.archived).then(onClose)}>
                {habit.archived ? 'Вернуть' : 'В архив'}
              </Button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="habit" icon="check" disabled={invalid} onClick={() => void save()}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) void save();
        }}
      >
        <TextInput label="Название" value={name} data-autofocus required maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Пить воду" />
        <Field label="Иконка">
          <div className={s.iconGrid} role="radiogroup" aria-label="Иконка">
            {HABIT_ICONS.map((ic) => (
              <button key={ic} type="button" role="radio" aria-checked={ic === icon} aria-label={ic} className={s.iconPick} onClick={() => setIcon(ic)}>
                <PixelIcon name={ic} size={24} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Расписание">
          <Segmented
            label="Расписание"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'daily', label: 'Каждый день' },
              { value: 'days', label: 'По дням недели' },
            ]}
          />
        </Field>
        {mode === 'days' && (
          <div style={{ marginBottom: 12 }}>
            <MultiToggle label="Дни недели" values={days} options={WD} onChange={setDays} />
          </div>
        )}
        <TextInput label="Напоминание (необязательно)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
