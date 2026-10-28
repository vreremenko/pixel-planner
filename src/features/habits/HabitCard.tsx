import s from './Habits.module.css';
import { Button, Checkbox, Panel, PixelIcon, cx } from '../../ui';
import type { Habit, LocalDate } from '../../domain/types';
import { addDays, endOfMonth, parseLocalDate, startOfMonth, weekday, WEEKDAYS_SHORT } from '../../domain/dates';
import { habitStreak, isScheduled } from '../../domain/streaks';
import { toggleHabit } from '../../services/habits';
import { dateOf } from '../../domain/dates';
import { scheduleText } from './habitText';

interface Props {
  habit: Habit;
  done: ReadonlySet<LocalDate>;
  month: LocalDate;
  todayDate: LocalDate;
  onEdit: () => void;
}

export function HabitCard({ habit, done, month, todayDate, onEdit }: Props) {
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
          <div>{habit.name}</div>
          <div className={s.sched}>
            {scheduleText(habit)}
            {habit.reminderTime && ` · 🔔 ${habit.reminderTime}`}
          </div>
        </div>
        <div className={s.todayRow}>
          {scheduledToday || doneToday ? (
            <Checkbox checked={doneToday} onChange={(v) => void toggleHabit(habit, todayDate, v)} label={`Выполнено сегодня: ${habit.name}`} color="var(--c-habit)" />
          ) : (
            <span className={s.rest}>отдых</span>
          )}
          <Button small variant="ghost" icon="edit" label="Изменить" onClick={onEdit} />
        </div>
      </div>
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
      </div>
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
              aria-label={`${parseLocalDate(d).day}: ${state}`}
              aria-pressed={isDone}
              onClick={() => void toggleHabit(habit, d, !isDone)}
            >
              {parseLocalDate(d).day}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
