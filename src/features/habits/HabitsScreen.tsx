import { useMemo, useState } from 'react';
import s from './Habits.module.css';
import { Button, PixelIcon } from '../../ui';
import { useHabitLogs, useHabits } from '../../data/hooks';
import { useToday } from '../../app/useToday';
import { useHotkeys } from '../../app/hotkeys';
import { addMonths, MONTHS, parseLocalDate, startOfMonth } from '../../domain/dates';
import type { Habit, LocalDate } from '../../domain/types';
import { HabitCard } from './HabitCard';
import { HabitEditor } from './HabitEditor';

export function HabitsScreen() {
  const habits = useHabits();
  const logs = useHabitLogs();
  const todayDate = useToday();
  const [month, setMonth] = useState(() => startOfMonth(todayDate));
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);

  useHotkeys(
    useMemo(
      () => ({
        n: () => setEditing('new'),
        ArrowLeft: () => setMonth((m) => addMonths(m, -1)),
        ArrowRight: () => setMonth((m) => addMonths(m, 1)),
      }),
      [],
    ),
  );

  const doneBy = useMemo(() => {
    const m = new Map<string, Set<LocalDate>>();
    for (const l of logs ?? []) {
      let set = m.get(l.habitId);
      if (!set) m.set(l.habitId, (set = new Set()));
      set.add(l.date);
    }
    return m;
  }, [logs]);

  const active = (habits ?? []).filter((h) => !h.archived);
  const archived = (habits ?? []).filter((h) => h.archived);
  const { y, m } = parseLocalDate(month);
  const empty = new Set<LocalDate>();

  return (
    <>
      <div className={s.top}>
        <h1 className="glow">Квесты</h1>
        <div className={s.monthNav}>
          <Button small icon="left" label="Предыдущий месяц" onClick={() => setMonth(addMonths(month, -1))} />
          <h3 aria-live="polite">
            {MONTHS[m - 1]} {y}
          </h3>
          <Button small icon="right" label="Следующий месяц" onClick={() => setMonth(addMonths(month, 1))} />
        </div>
        <Button variant="habit" icon="plus" onClick={() => setEditing('new')}>
          Квест
        </Button>
      </div>
      {habits && active.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--c-text-dim)', padding: '32px 0' }}>
          <PixelIcon name="star" size={48} />
          <p>Квестов пока нет. Создайте первую привычку — и начните стрик!</p>
        </div>
      )}
      <div className={s.list}>
        {active.map((h) => (
          <HabitCard key={h.id} habit={h} done={doneBy.get(h.id) ?? empty} month={month} todayDate={todayDate} onEdit={() => setEditing(h)} />
        ))}
      </div>
      {archived.length > 0 && (
        <details className={s.archived}>
          <summary className="title" style={{ fontSize: 10, cursor: 'pointer', color: 'var(--c-text-dim)' }}>
            Архив ({archived.length})
          </summary>
          <div className={s.list} style={{ marginTop: 12 }}>
            {archived.map((h) => (
              <HabitCard key={h.id} habit={h} done={doneBy.get(h.id) ?? empty} month={month} todayDate={todayDate} onEdit={() => setEditing(h)} />
            ))}
          </div>
        </details>
      )}
      {editing && <HabitEditor habit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
