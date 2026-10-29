import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import s from './Tags.module.css';
import { Button, Checkbox, Panel, PixelIcon, cx } from '../../ui';
import { useAllTasks, useSeries } from '../../data/hooks';
import { useToday } from '../../app/useToday';
import { useUi } from '../../stores/ui';
import { formatDateLong } from '../../domain/dates';
import { describeRule } from '../../domain/recurrence';
import { groupByTag, normalizeTag } from '../../domain/tags';
import { toggleTask } from '../../services/tasks';
import type { Task } from '../../domain/types';
import { PRIORITY_COLOR, PRIORITY_SHORT } from '../day/labels';

function TaskRow({ task, overdue }: { task: Task; overdue?: boolean }) {
  const openEditor = useUi((st) => st.openEditor);
  return (
    <li className={cx(s.row, task.done && s.done)} style={{ '--prio': PRIORITY_COLOR[task.priority] } as CSSProperties}>
      <Checkbox checked={task.done} onChange={(d) => void toggleTask(task, d)} label={`Выполнено: ${task.title}`} color="var(--c-task)" />
      <button className={s.titleBtn} onClick={() => openEditor({ kind: 'task', task })} aria-label={`Редактировать «${task.title}»`}>
        <span className={s.title}>{task.title}</span>
        <span className={s.meta}>
          <span className={overdue ? s.overdue : undefined}>{task.date ? `${formatDateLong(task.date)}${task.time ? `, ${task.time}` : ''}` : 'без даты'}</span>
          {' · '}
          <span style={{ color: PRIORITY_COLOR[task.priority] }}>{PRIORITY_SHORT[task.priority]}</span>
        </span>
      </button>
    </li>
  );
}

function Section({ title, color, children, count }: { title: string; color: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section className={s.section}>
      <Panel title={`${title} · ${String(count)}`} accent={color}>
        <ul className={s.list}>{children}</ul>
      </Panel>
    </section>
  );
}

/** Все задачи с одной меткой: по всем дням, из инвентаря, повторяющиеся и недавно выполненные. */
export function TagScreen() {
  const { tag: raw = '' } = useParams();
  const navigate = useNavigate();
  const tag = normalizeTag(raw);
  const todayDate = useToday();
  const tasks = useAllTasks();
  const series = useSeries();
  const g = useMemo(() => groupByTag(tasks ?? [], series ?? [], tag, todayDate), [tasks, series, tag, todayDate]);
  const openCount = g.overdue.length + g.today.length + g.upcoming.length + g.backlog.length;
  const loaded = tasks !== undefined && series !== undefined;
  const empty = loaded && openCount + g.done.length + g.series.length === 0;

  return (
    <>
      <div className={s.top}>
        <Button icon="left" label="Назад к дню" onClick={() => void navigate('/')} />
        <h1 className="glow">#{tag}</h1>
        <span className={s.stats}>
          открыто: {openCount}
          {g.series.length > 0 && `, повторяющихся: ${String(g.series.length)}`}
        </span>
      </div>
      {empty && (
        <div className={s.empty}>
          <PixelIcon name="tag" size={48} />
          <p>С меткой #{tag} пока ничего нет.</p>
        </div>
      )}
      <Section title="Просрочено" color="var(--c-warn)" count={g.overdue.length}>
        {g.overdue.map((t) => (
          <TaskRow key={t.id} task={t} overdue />
        ))}
      </Section>
      <Section title="Сегодня" color="var(--c-task)" count={g.today.length}>
        {g.today.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </Section>
      <Section title="Дальше" color="var(--c-task)" count={g.upcoming.length}>
        {g.upcoming.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </Section>
      <Section title="Инвентарь" color="var(--c-backlog)" count={g.backlog.length}>
        {g.backlog.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </Section>
      <Section title="Повторяющиеся" color="var(--c-task)" count={g.series.length}>
        {g.series.map((x) => (
          <li key={x.id} className={s.row} style={{ '--prio': PRIORITY_COLOR[x.priority] } as CSSProperties}>
            <PixelIcon name="repeat" size={16} />
            <span className={s.titleBtn}>
              <span className={s.title}>{x.title}</span>
              <span className={s.meta}>
                {describeRule(x.rule)}
                {x.time ? `, ${x.time}` : ''}
              </span>
            </span>
          </li>
        ))}
      </Section>
      <Section title="Недавно выполнено" color="var(--c-habit)" count={g.done.length}>
        {g.done.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </Section>
    </>
  );
}
