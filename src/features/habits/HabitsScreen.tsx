import { useMemo, useState } from 'react';
import s from './Habits.module.css';
import { Button, PixelIcon } from '../../ui';
import { useHabitLogs, useHabits } from '../../data/hooks';
import { useToday } from '../../app/useToday';
import { useHotkeys } from '../../app/hotkeys';
import { addMonths, MONTHS, parseLocalDate, startOfMonth } from '../../domain/dates';
import { isCountHabit, type Habit, type LocalDate } from '../../domain/types';
import { HabitCard } from './HabitCard';
import { HabitEditor } from './HabitEditor';
import { HabitDetail } from './HabitDetail';
import { HabitValueDialog } from './HabitValueDialog';

export function HabitsScreen() {
  const habits = useHabits();
  const logs = useHabitLogs();
  const todayDate = useToday();
  const [month, setMonth] = useState(() => startOfMonth(todayDate));
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [valueFor, setValueFor] = useState<{ habitId: string; date: LocalDate } | null>(null);

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

  // Значения по дням у счётных привычек: habitId → (дата → число)
  const valuesBy = useMemo(() => {
    const m = new Map<string, Map<LocalDate, number>>();
    for (const l of logs ?? []) {
      if (l.value === undefined) continue;
      let v = m.get(l.habitId);
      if (!v) m.set(l.habitId, (v = new Map<LocalDate, number>()));
      v.set(l.date, l.value);
    }
    return m;
  }, [logs]);
  const noValues = new Map<LocalDate, number>();
  const find = (id: string | null) => (id ? (habits ?? []).find((h) => h.id === id) : undefined);
  const detail = find(detailId);
  const valueHabit = find(valueFor?.habitId ?? null);

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
          <HabitCard
            key={h.id}
            habit={h}
            done={doneBy.get(h.id) ?? empty}
            values={valuesBy.get(h.id) ?? noValues}
            month={month}
            todayDate={todayDate}
            onEdit={() => setEditing(h)}
            onOpen={() => setDetailId(h.id)}
            onPickDay={(date) => setValueFor({ habitId: h.id, date })}
          />
        ))}
      </div>
      {archived.length > 0 && (
        <details className={s.archived}>
          <summary className="title" style={{ fontSize: 10, cursor: 'pointer', color: 'var(--c-text-dim)' }}>
            Архив ({archived.length})
          </summary>
          <div className={s.list} style={{ marginTop: 12 }}>
            {archived.map((h) => (
              <HabitCard
            key={h.id}
            habit={h}
            done={doneBy.get(h.id) ?? empty}
            values={valuesBy.get(h.id) ?? noValues}
            month={month}
            todayDate={todayDate}
            onEdit={() => setEditing(h)}
            onOpen={() => setDetailId(h.id)}
            onPickDay={(date) => setValueFor({ habitId: h.id, date })}
          />
            ))}
          </div>
        </details>
      )}
      {editing && <HabitEditor habit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {detail && isCountHabit(detail) && !editing && !valueFor && (
        <HabitDetail
          habit={detail}
          unit={detail.tracking.unit}
          values={valuesBy.get(detail.id) ?? noValues}
          todayDate={todayDate}
          onAdd={(date) => setValueFor({ habitId: detail.id, date })}
          onEdit={() => setEditing(detail)}
          onClose={() => setDetailId(null)}
        />
      )}
      {valueHabit && isCountHabit(valueHabit) && valueFor && (
        <HabitValueDialog
          habit={valueHabit}
          unit={valueHabit.tracking.unit}
          date={valueFor.date}
          values={valuesBy.get(valueHabit.id) ?? noValues}
          todayDate={todayDate}
          onClose={() => setValueFor(null)}
        />
      )}
    </>
  );
}
