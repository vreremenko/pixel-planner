import s from './Habits.module.css';
import { useState } from 'react';
import { Button, Checkbox, Panel, PixelIcon, cx } from '../../../core/ui';
import { type LocalDate } from '../../../core/domain/types';
import { isCountHabit, type Habit } from '../domain/types';
import { formatValue, parseValue } from '../domain/habitStats';
import { addDays, endOfMonth, parseLocalDate, startOfMonth, weekday, WEEKDAYS_SHORT } from '../../../core/domain/dates';
import { habitStreak, isScheduled } from '../domain/streaks';
import { setHabitValue, toggleHabit } from '../services/habits';
import { dateOf } from '../../../core/domain/dates';
import { scheduleText } from './habitText';
import { collapseKey, useCollapsed } from '../../../core/stores/collapsed';

interface Props {
  habit: Habit;
  done: ReadonlySet<LocalDate>;
  /** Значения по дням — только у счётных привычек. */
  values: ReadonlyMap<LocalDate, number>;
  month: LocalDate;
  todayDate: LocalDate;
  onEdit: () => void;
  /** Открыть график и историю (счётные привычки). */
  onOpen: () => void;
  /** Записать значение за день (счётные привычки). */
  onPickDay: (date: LocalDate) => void;
}

/** Быстрый ввод числа за сегодня. */
function TodayCount({ habit, unit, value, todayDate }: { habit: Habit; unit: string; value: number | undefined; todayDate: LocalDate }) {
  const [text, setText] = useState(value === undefined ? '' : formatValue(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    // Значение изменилось снаружи (диалог, другая вкладка) — подтягиваем в поле
    setPrev(value);
    setText(value === undefined ? '' : formatValue(value));
  }
  const parsed = parseValue(text);
  const dirty = parsed !== (value ?? null) && !(parsed === null && text.trim() === '' && value === undefined);
  const invalid = text.trim() !== '' && parsed === null;
  return (
    <form
      className={s.countRow}
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) void setHabitValue(habit, todayDate, parsed ?? 0);
      }}
    >
      <label className="sr-only" htmlFor={`count-${habit.id}`}>
        Сколько сегодня ({unit})
      </label>
      <input
        id={`count-${habit.id}`}
        className={s.countInput}
        inputMode="decimal"
        autoComplete="off"
        maxLength={12}
        placeholder="0"
        value={text}
        aria-invalid={invalid}
        onChange={(e) => setText(e.target.value)}
      />
      <span className={s.unit} title={unit}>
        {unit}
      </span>
      <Button type="submit" small variant="habit" icon="check" className={s.countBtn} disabled={invalid || !dirty}>
        {value === undefined ? 'Записать' : 'Обновить'}
      </Button>
    </form>
  );
}

export function HabitCard({ habit, done, values, month, todayDate, onEdit, onOpen, onPickDay }: Props) {
  const count = isCountHabit(habit) ? habit.tracking : null;
  const key = collapseKey.habit(habit.id);
  const collapsed = useCollapsed((st) => st.collapsed[key] === true);
  const toggleCollapsed = useCollapsed((st) => st.toggle);
  const streak = habitStreak(habit, done, todayDate);
  const scheduledToday = isScheduled(habit.schedule, todayDate);
  const doneToday = done.has(todayDate);
  const created = dateOf(new Date(habit.createdAt));

  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const cells: (LocalDate | null)[] = Array.from({ length: weekday(first) }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);

  return (
    <Panel as="article" accent="var(--c-habit)" aria-label={habit.name}>
      <div className={s.head}>
        <div className={s.iconBox}>
          <PixelIcon name={habit.icon} size={32} />
        </div>
        <div className={s.name}>
          {count ? (
            <button type="button" className={s.nameBtn} onClick={onOpen} aria-label={`График и история: ${habit.name}`}>
              {habit.name}
            </button>
          ) : (
            <div>{habit.name}</div>
          )}
          <div className={s.sched}>
            {scheduleText(habit)}
            {habit.reminderTime && ` · 🔔 ${habit.reminderTime}`}
          </div>
        </div>
        <div className={s.todayRow}>
          {count ? (
            <Button small variant="ghost" icon="bars" label="График и история" onClick={onOpen} />
          ) : scheduledToday || doneToday ? (
            <Checkbox checked={doneToday} onChange={(v) => void toggleHabit(habit, todayDate, v)} label={`Выполнено сегодня: ${habit.name}`} color="var(--c-habit)" />
          ) : (
            <span className={s.rest}>отдых</span>
          )}
          <Button small variant="ghost" icon="edit" label="Изменить" onClick={onEdit} />
        </div>
      </div>
      {count && (scheduledToday || doneToday) && (
        <TodayCount habit={habit} unit={count.unit} value={values.get(todayDate)} todayDate={todayDate} />
      )}
      <div className={s.streaks}>
        <div>
          СТРИК
          <b>
            {streak.current}
            {streak.current >= 3 && <PixelIcon name="fire" size={16} />}
          </b>
        </div>
        <div>
          РЕКОРД
          <b>{streak.best}</b>
        </div>
        <Button
          small
          variant="ghost"
          className={s.collapseBtn}
          icon={collapsed ? 'down' : 'up'}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Показать' : 'Свернуть'} календарь: ${habit.name}`}
          onClick={() => toggleCollapsed(key)}
        >
          {collapsed ? 'Календарь' : 'Свернуть'}
        </Button>
      </div>
      {!collapsed && (
        <div className={s.grid} role="grid" aria-label="Выполнение за месяц">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className={s.dow}>
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} className={cx(s.cell, s.blank)} />;
            const isDone = done.has(d);
            const sched = isScheduled(habit.schedule, d);
            const future = d > todayDate;
            const miss = sched && !isDone && d < todayDate && d >= created;
            const state = isDone ? 'выполнено' : future ? 'впереди' : miss ? 'пропущено' : sched ? 'не отмечено' : 'выходной';
            return (
              <button
                key={d}
                type="button"
                disabled={future}
                className={cx(s.cell, !sched && s.off, isDone && s.done, miss && s.miss, d === todayDate && s.today)}
                aria-label={`${parseLocalDate(d).day}: ${state}${count && values.has(d) ? `, ${formatValue(values.get(d) ?? 0)} ${count.unit}` : ''}`}
                aria-pressed={isDone}
                title={count && values.has(d) ? `${formatValue(values.get(d) ?? 0)} ${count.unit}` : undefined}
                onClick={() => (count ? onPickDay(d) : void toggleHabit(habit, d, !isDone))}
              >
                {parseLocalDate(d).day}
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
