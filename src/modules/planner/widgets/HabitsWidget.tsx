/* Карточка «Привычки» на сводке: привычки на сегодня с отметкой (счётные — переход в раздел). */
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Checkbox, PixelIcon, cx } from '../../../core/ui';
import { useToday } from '../../../core/shell/useToday';
import { useHabitLogs, useHabits } from '../data/hooks';
import { isScheduled } from '../domain/streaks';
import { formatValue } from '../domain/habitStats';
import { isCountHabit } from '../domain/types';
import { toggleHabit } from '../services/habits';
import s from './Widgets.module.css';

export function HabitsWidget() {
  const todayDate = useToday();
  const habits = useHabits();
  const logs = useHabitLogs();

  const today = useMemo(() => (habits ?? []).filter((h) => !h.archived && isScheduled(h.schedule, todayDate)), [habits, todayDate]);
  const values = useMemo(() => new Map((logs ?? []).filter((l) => l.date === todayDate).map((l) => [l.habitId, l.value ?? 1])), [logs, todayDate]);

  if (!habits || !logs) return null;
  if (habits.filter((h) => !h.archived).length === 0) {
    return (
      <p className={s.muted} style={{ marginTop: 0 }}>
        Привычек пока нет. <Link to="/habits">Добавить</Link>
      </p>
    );
  }
  const done = today.filter((h) => values.has(h.id)).length;

  return (
    <>
      <div className={s.summary}>
        <span className={s.count}>
          {done} из {today.length}
        </span>
        <span className={s.time}>{today.length === 0 ? 'сегодня отдых' : 'на сегодня'}</span>
      </div>
      {today.length > 0 && (
        <ul className={s.list}>
          {today.map((h) => {
            const v = values.get(h.id);
            return (
              <li key={h.id} className={cx(s.item, v !== undefined && s.done)}>
                {isCountHabit(h) ? (
                  <Link to="/habits" aria-label={`Ввести значение: ${h.name}`} style={{ color: 'var(--c-habit)', display: 'flex' }}>
                    <PixelIcon name="plus" size={24} />
                  </Link>
                ) : (
                  <Checkbox checked={v !== undefined} onChange={(on) => void toggleHabit(h, todayDate, on)} label={`Выполнено сегодня: ${h.name}`} color="var(--c-habit)" />
                )}
                <span className={s.title}>{h.name}</span>
                {isCountHabit(h) && v !== undefined && (
                  <span className={cx(s.time, 'digits')}>
                    {formatValue(v)} {h.tracking.unit}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
