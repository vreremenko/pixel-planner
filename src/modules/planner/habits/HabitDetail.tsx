import { useMemo, useState } from 'react';
import s from './Habits.module.css';
import { Button, Modal, Segmented } from '../../../core/ui';
import { TrendChart } from '../../../core/charts/TrendChart';
import { addDays, formatDateLong } from '../../../core/domain/dates';
import { buildSeries, compactParts, countStats, formatValue, movingAverage } from '../domain/habitStats';
import { percentDelta } from '../domain/stats';
import type { LocalDate } from '../../../core/domain/types';
import type { Habit } from '../domain/types';

type Range = '14' | '30' | '90';

interface Props {
  habit: Habit;
  unit: string;
  values: ReadonlyMap<LocalDate, number>;
  todayDate: LocalDate;
  onAdd: (date: LocalDate) => void;
  onEdit: () => void;
  onClose: () => void;
}

export function HabitDetail({ habit, unit, values, todayDate, onAdd, onEdit, onClose }: Props) {
  const [range, setRange] = useState<Range>('30');
  const days = Number(range);
  const stats = useMemo(() => countStats(values, todayDate), [values, todayDate]);
  // Среднее считаем по окну с запасом в 6 дней, чтобы линия у левого края не «стартовала с нуля»
  const { points, average } = useMemo(() => {
    const full = buildSeries(values, addDays(todayDate, -(days - 1 + 6)), todayDate);
    const avg = movingAverage(full, 7);
    return { points: full.slice(6), average: avg.slice(6) };
  }, [values, todayDate, days]);

  const history = useMemo(() => [...values].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30), [values]);
  const delta = stats.last7Avg !== null && stats.prev7Avg !== null ? percentDelta(stats.last7Avg, stats.prev7Avg) : null;
  const num = (v: number | null) => {
    if (v === null) return '—';
    const { text, suffix } = compactParts(v);
    return (
      <>
        {text}
        {suffix && <small className={s.suffix}>{suffix}</small>}
      </>
    );
  };
  const full = (v: number | null) => (v === null ? undefined : `${formatValue(v)} ${unit}`);

  return (
    <Modal
      open
      onClose={onClose}
      title={habit.name}
      accent="var(--c-habit)"
      footer={
        <>
          <Button icon="edit" onClick={onEdit}>
            Изменить привычку
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="habit" icon="plus" onClick={() => onAdd(todayDate)}>
            Записать
          </Button>
        </>
      }
    >
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.tileLabel}>Сегодня</div>
          <b title={full(stats.today)}>{num(stats.today)}</b>
          <span>{unit}</span>
        </div>
        <div className={s.tile}>
          <div className={s.tileLabel}>Среднее, 7 дн.</div>
          <b title={full(stats.last7Avg)}>{num(stats.last7Avg !== null ? Math.round(stats.last7Avg * 10) / 10 : null)}</b>
          <span style={{ color: delta === null ? undefined : delta >= 0 ? 'var(--c-habit)' : 'var(--c-warn)' }}>
            {delta === null ? unit : `${delta >= 0 ? '▲ +' : '▼ '}${Math.abs(delta) > 999 ? '>999' : String(delta)}%`}
          </span>
        </div>
        <div className={s.tile}>
          <div className={s.tileLabel}>Лучший день</div>
          <b title={full(stats.best?.value ?? null)}>{num(stats.best?.value ?? null)}</b>
          <span>{stats.best ? stats.best.date.split('-').reverse().slice(0, 2).join('.') : unit}</span>
        </div>
        <div className={s.tile}>
          <div className={s.tileLabel}>Всего</div>
          <b title={full(stats.total)}>{num(stats.total)}</b>
          <span>{unit}</span>
        </div>
      </div>

      <div style={{ margin: '12px 0 8px' }}>
        <Segmented
          label="Период графика"
          value={range}
          onChange={setRange}
          options={[
            { value: '14', label: '14 дней' },
            { value: '30', label: '30 дней' },
            { value: '90', label: '90 дней' },
          ]}
        />
      </div>
      {stats.entries === 0 ? (
        <p style={{ color: 'var(--c-text-dim)' }}>Записей пока нет. Нажмите «Записать», чтобы внести первое значение, — график появится здесь.</p>
      ) : (
        <TrendChart points={points} average={average} unit={unit} title={`${habit.name}: значения за ${range} дней`} />
      )}

      {history.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 8px' }}>История</h3>
          <ul className={s.history}>
            {history.map(([date, value]) => (
              <li key={date}>
                <span className={s.historyDate}>{formatDateLong(date)}</span>
                <span className={s.historyValue}>
                  {formatValue(value)} {unit}
                </span>
                <Button small variant="ghost" icon="edit" label={`Изменить запись за ${date}`} onClick={() => onAdd(date)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
