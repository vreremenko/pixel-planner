import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import s from './Stats.module.css';
import { Button, Panel, Segmented, cx } from '../../../core/ui';
import { useToday } from '../../../core/shell/useToday';
import { addDays, addMonths, endOfMonth, formatDateShort, MONTHS, parseLocalDate, startOfMonth, startOfWeek, WEEKDAYS_SHORT } from '../../../core/domain/dates';
import { computeStats, percentDelta, type PeriodStats } from '../domain/stats';
import { habitLogRepo, habitRepo, taskRepo } from '../data/repo';
import { loadOccurrences } from '../data/hooks';
import type { LocalDate } from '../../../core/domain/types';
import { BarChart } from '../../../core/charts/BarChart';
import { Heatmap } from '../../../core/charts/Heatmap';

type Mode = 'week' | 'month';
const HEAT_WEEKS = 20;

function periodOf(mode: Mode, anchor: LocalDate) {
  if (mode === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6), prevFrom: addDays(from, -7), prevTo: addDays(from, -1) };
  }
  const from = startOfMonth(anchor);
  const prev = addMonths(from, -1);
  return { from, to: endOfMonth(from), prevFrom: prev, prevTo: endOfMonth(prev) };
}

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

function Delta({ cur, prev, label }: { cur: number; prev: number; label: string }) {
  const d = percentDelta(cur, prev);
  const diff = cur - prev;
  if (diff === 0) return <div className={s.delta}>= как {label}</div>;
  const arrow = diff > 0 ? '▲' : '▼';
  return (
    <div className={cx(s.delta, diff > 0 ? s.up : s.down)}>
      {arrow} {diff > 0 ? '+' : ''}
      {diff}
      {d !== null && ` (${d > 0 ? '+' : ''}${d}%)`} <span style={{ color: 'var(--c-text-dim)' }}>vs {label}</span>
    </div>
  );
}

function Tile({ label, value, accent, children }: { label: string; value: string | number; accent: string; children?: ReactNode }) {
  return (
    <div className={s.tile} style={{ '--accent': accent } as CSSProperties}>
      <div className={s.tileLabel}>{label}</div>
      <div className={s.tileValue}>{value}</div>
      {children}
    </div>
  );
}

export function StatsScreen() {
  const todayDate = useToday();
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(todayDate);
  const p = periodOf(mode, anchor);
  const heatFrom = addDays(startOfWeek(todayDate), -(HEAT_WEEKS - 1) * 7);
  const loadFrom = [p.prevFrom, heatFrom].sort()[0] ?? heatFrom;
  const loadTo = p.to > todayDate ? p.to : todayDate;

  const data = useLiveQuery(async () => {
    const [tasks, habits, habitLogs, occurrences] = await Promise.all([
      taskRepo.all(),
      habitRepo.all(),
      habitLogRepo.all(),
      loadOccurrences(loadFrom, loadTo, todayDate),
    ]);
    return { tasks, habits, habitLogs, occurrences };
  }, [loadFrom, loadTo, todayDate]);

  const stats = useMemo(() => {
    if (!data) return null;
    const calc = (from: LocalDate, to: LocalDate): PeriodStats => computeStats({ ...data, from, to, todayDate });
    return {
      cur: calc(p.from, p.to),
      prev: calc(p.prevFrom, p.prevTo),
      heat: calc(heatFrom, todayDate).perDay,
    };
  }, [data, p.from, p.to, p.prevFrom, p.prevTo, heatFrom, todayDate]);

  const shift = (n: number) => setAnchor(mode === 'week' ? addDays(anchor, n * 7) : addMonths(anchor, n));
  const { y, m } = parseLocalDate(p.from);
  const periodTitle = mode === 'week' ? `${formatDateShort(p.from)} – ${formatDateShort(p.to)}` : `${MONTHS[m - 1]} ${y}`;
  const prevLabel = mode === 'week' ? 'прошл. неделя' : 'прошл. месяц';

  return (
    <>
      <div className={s.top}>
        <h1 className="glow">Статистика</h1>
        <Segmented
          label="Период"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'week', label: 'Неделя' },
            { value: 'month', label: 'Месяц' },
          ]}
        />
        <div className={s.period}>
          <Button small icon="left" label="Предыдущий период" onClick={() => shift(-1)} />
          <h3 aria-live="polite">{periodTitle}</h3>
          <Button small icon="right" label="Следующий период" onClick={() => shift(1)} />
        </div>
      </div>
      {stats && (
        <>
          <div className={s.tiles}>
            <Tile label="Задач закрыто" value={stats.cur.tasksClosed} accent="var(--c-task)">
              <Delta cur={stats.cur.tasksClosed} prev={stats.prev.tasksClosed} label={prevLabel} />
            </Tile>
            <Tile label="Из бэклога" value={stats.cur.fromBacklog} accent="var(--c-backlog)">
              <Delta cur={stats.cur.fromBacklog} prev={stats.prev.fromBacklog} label={prevLabel} />
            </Tile>
            <Tile label="Повторяющиеся" value={pct(stats.cur.recurringRate)} accent="var(--c-task)">
              <div className={s.delta}>
                {stats.cur.recurringDone} из {stats.cur.recurringTotal} · было {pct(stats.prev.recurringRate)}
              </div>
            </Tile>
            <Tile label="Привычки" value={pct(stats.cur.habitRate)} accent="var(--c-habit)">
              <div className={s.delta}>
                {stats.cur.habitsDone} из {stats.cur.habitsScheduled} · было {pct(stats.prev.habitRate)}
              </div>
            </Tile>
            <Tile label="Всего действий" value={stats.cur.total} accent="var(--c-gold)">
              <Delta cur={stats.cur.total} prev={stats.prev.total} label={prevLabel} />
            </Tile>
          </div>
          <div className={s.charts}>
            <Panel title="По дням недели" icon="bars" accent="var(--c-task)">
              <BarChart
                title={`Закрыто задач, повторов и привычек по дням недели: ${periodTitle}`}
                bars={stats.cur.byWeekday.map((v, i) => ({ label: WEEKDAYS_SHORT[i] ?? '', value: v, hint: `${WEEKDAYS_SHORT[i] ?? ''}: ${v}` }))}
              />
            </Panel>
            <Panel title={`Активность: ${HEAT_WEEKS} недель`} icon="calendar" accent="var(--c-habit)">
              <Heatmap values={stats.heat} end={todayDate} weeks={HEAT_WEEKS} title="Тепловая карта выполненных дел по дням" />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
