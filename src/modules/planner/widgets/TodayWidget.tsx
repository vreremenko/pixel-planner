/* Карточка «Сегодня» на сводке: прогресс дня и ближайшие невыполненные задачи с отметкой. */
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Button, Checkbox, cx } from '../../../core/ui';
import { ProgressBar } from '../../../core/charts/ProgressBar';
import { useToday } from '../../../core/shell/useToday';
import { useDay } from '../data/hooks';
import { toggleOccurrence, toggleTask } from '../services/tasks';
import { useUi } from '../stores/ui';
import type { Occurrence, Task } from '../domain/types';
import s from './Widgets.module.css';

type Item = { kind: 'task'; task: Task } | { kind: 'occ'; occ: Occurrence };

const SHOWN = 5;
const title = (it: Item) => (it.kind === 'task' ? it.task.title : it.occ.title);
const time = (it: Item) => (it.kind === 'task' ? it.task.time : it.occ.time);
const isDone = (it: Item) => (it.kind === 'task' ? it.task.done : it.occ.status === 'done');
const order = (it: Item) => (it.kind === 'task' ? it.task.order : it.occ.order);

export function TodayWidget() {
  const todayDate = useToday();
  const data = useDay(todayDate, todayDate);
  const openEditor = useUi((u) => u.openEditor);

  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    return [
      ...data.tasks.map((task) => ({ kind: 'task' as const, task })),
      ...data.occurrences.filter((o) => o.status !== 'skipped').map((occ) => ({ kind: 'occ' as const, occ })),
    ].sort((a, b) => (time(a) ?? '99:99').localeCompare(time(b) ?? '99:99') || order(a) - order(b));
  }, [data]);

  if (!data) return null;
  const done = items.filter(isDone).length;
  const pending = items.filter((it) => !isDone(it));

  return (
    <>
      <div className={s.summary}>
        <span className={s.count}>
          {done} из {items.length}
        </span>
        <span className={s.time}>{items.length === 0 ? 'задач нет' : pending.length === 0 ? 'всё сделано!' : `осталось ${pending.length}`}</span>
      </div>
      <ProgressBar value={items.length ? done / items.length : 0} color="var(--c-task)" label="Выполнено задач сегодня" />
      {pending.length > 0 && (
        <ul className={s.list}>
          {pending.slice(0, SHOWN).map((it) => (
            <li key={it.kind === 'task' ? it.task.id : it.occ.key} className={cx(s.item, isDone(it) && s.done)}>
              <Checkbox
                checked={false}
                onChange={(v) => void (it.kind === 'task' ? toggleTask(it.task, v) : toggleOccurrence(it.occ, v))}
                label={`Выполнено: ${title(it)}`}
                color="var(--c-task)"
              />
              <span className={s.title}>{title(it)}</span>
              {time(it) && <span className={cx(s.time, 'digits')}>{time(it)}</span>}
            </li>
          ))}
        </ul>
      )}
      {pending.length > SHOWN && (
        <p className={s.muted}>
          <Link to="/day">…и ещё {pending.length - SHOWN}</Link>
        </p>
      )}
      <div className={s.footer}>
        <Button small icon="plus" onClick={() => openEditor({ kind: 'new', date: todayDate })}>
          Задача
        </Button>
      </div>
    </>
  );
}
