/*
 * «Замеры»: вес, процент жира и обхваты. Сверху плитки с последними значениями (нажатие выбирает
 * показатель для графика), ниже график и история. Замер за день — одна запись, её можно дополнять.
 */
import { useMemo, useState } from 'react';
import { addDays, formatDateDay, formatDateShort } from '../../../core/domain/dates';
import { formatValue, parseValue } from '../../../core/domain/numbers';
import { useToday } from '../../../core/shell/useToday';
import { Button, ConfirmDialog, DateField, Modal, Panel, Segmented, TextInput, cx, toast } from '../../../core/ui';
import { useBody } from '../data/hooks';
import { bodyRepo } from '../data/repo';
import { METRICS, METRIC_IDS, bodyId, cleanValues, formatDelta, seriesOf, summaries, type BodyEntry, type MetricId } from '../domain/body';
import { BodyChart } from '../ui/BodyChart';
import s from './Gym.module.css';

type Range = '90' | '365' | 'all';
const RANGES: readonly { value: Range; label: string }[] = [
  { value: '90', label: '3 месяца' },
  { value: '365', label: 'Год' },
  { value: 'all', label: 'Всё время' },
];

const valueText = (id: MetricId, v: number) => `${formatValue(v)}\u00a0${METRICS[id].unit}`;

export function BodyScreen() {
  const entries = useBody();
  const todayDate = useToday();
  const [picked, setPicked] = useState<MetricId | null>(null);
  const [range, setRange] = useState<Range>('90');
  const [editing, setEditing] = useState<string | null>(null);
  const sums = useMemo(() => summaries(entries ?? []), [entries]);
  if (!entries) return null;

  const metric = picked && sums.some((x) => x.id === picked) ? picked : (sums[0]?.id ?? 'weight');
  const from = range === 'all' ? '' : addDays(todayDate, -Number(range));
  const points = seriesOf(entries, metric).filter((p) => p.date >= from);

  return (
    <>
      <div className={s.head}>
        <h1 className="glow pageTitle" style={{ color: 'var(--c-gym)' }}>
          Замеры
        </h1>
        <Button variant="primary" icon="plus" onClick={() => setEditing(todayDate)}>
          Записать замер
        </Button>
      </div>
      <div className={s.stack}>
        {sums.length === 0 ? (
          <Panel title="Пока пусто" icon="target" accent="var(--c-gym)">
            <p style={{ marginTop: 0 }}>Записывайте вес и обхваты раз в неделю-две, утром и в одинаковых условиях — здесь появятся последние значения, изменения и график.</p>
            <Button variant="primary" icon="plus" onClick={() => setEditing(todayDate)}>
              Первый замер
            </Button>
          </Panel>
        ) : (
          <>
            <Panel title="Последние значения" icon="target" accent="var(--c-gym)">
              <div className={s.tiles}>
                {sums.map((x) => {
                  const d = x.prev ? x.last.value - x.prev.value : null;
                  return (
                    <button key={x.id} type="button" className={cx(s.tile, x.id === metric && s.tileOn)} aria-pressed={x.id === metric} onClick={() => setPicked(x.id)}>
                      <span className={s.tileLabel}>{METRICS[x.id].label}</span>
                      <span className={s.tileValue}>
                        {formatValue(x.last.value)} <small>{METRICS[x.id].unit}</small>
                      </span>
                      <span className={s.tileDelta}>{d === null ? formatDateShort(x.last.date) : `${formatDelta(d)} к ${formatDateShort(x.prev?.date ?? '')}`}</span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel title={`${METRICS[metric].label}, ${METRICS[metric].unit}`} icon="bars" accent="var(--c-gym)">
              <div style={{ marginBottom: 12 }}>
                <Segmented label="Период" value={range} options={RANGES} onChange={setRange} accent="var(--c-gym)" />
              </div>
              {points.length === 0 ? (
                <p className={s.dim} style={{ margin: 0 }}>
                  За этот период замеров нет.
                </p>
              ) : (
                <>
                  <BodyChart points={points} unit={METRICS[metric].unit} title={`${METRICS[metric].label}: замеры`} />
                  {points.length > 1 && (
                    <p className={s.hint} style={{ marginBottom: 0 }}>
                      За период: {formatDelta((points.at(-1)?.value ?? 0) - (points[0]?.value ?? 0))} {METRICS[metric].unit} ({formatValue(points[0]?.value ?? 0)} → {formatValue(points.at(-1)?.value ?? 0)})
                    </p>
                  )}
                </>
              )}
            </Panel>

            <Panel title="История" icon="book" accent="var(--c-gym)">
              <ul className={s.list}>
                {entries.map((e) => (
                  <li key={e.id}>
                    <button type="button" className={cx(s.row, s.link, s.plainButton)} onClick={() => setEditing(e.date)}>
                      <span className={s.grow}>
                        {formatDateDay(e.date)}
                        <br />
                        <span className={s.dim}>
                          {METRIC_IDS.filter((id) => e.values[id] !== undefined)
                            .map((id) => `${METRICS[id].label.toLowerCase()}\u00a0${valueText(id, e.values[id] ?? 0)}`)
                            .join('\u00a0· ')}
                        </span>
                      </span>
                      <span className={s.dim} aria-hidden="true">
                        ✎
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}
      </div>
      {editing !== null && <BodyEditor key={editing} date={editing} entries={entries} onClose={() => setEditing(null)} />}
    </>
  );
}

function BodyEditor({ date: initial, entries, onClose }: { date: string; entries: readonly BodyEntry[]; onClose: () => void }) {
  const todayDate = useToday();
  const [date, setDate] = useState(initial);
  const existing = entries.find((e) => e.date === date);
  const text = (e: BodyEntry | undefined) => Object.fromEntries(METRIC_IDS.map((id) => [id, e?.values[id] === undefined ? '' : formatValue(e.values[id])]));
  const [form, setForm] = useState<Record<string, string>>(() => text(existing));
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Подсказка в пустом поле — последнее значение до этой даты
  const before = (id: MetricId) => seriesOf(entries, id).filter((p) => p.date < date).at(-1)?.value;

  const changeDate = (d: string) => {
    setDate(d);
    const other = entries.find((e) => e.date === d);
    if (other) setForm(text(other));
  };

  const save = () => {
    const bad = METRIC_IDS.find((id) => (form[id] ?? '').trim() !== '' && parseValue(form[id] ?? '') === null);
    if (bad) {
      toast(`Проверьте поле «${METRICS[bad].label}»`, 'alert', 'var(--c-warn)');
      return;
    }
    const values = cleanValues(Object.fromEntries(METRIC_IDS.map((id) => [id, parseValue(form[id] ?? '')])));
    if (Object.keys(values).length === 0) {
      toast('Заполните хотя бы один показатель', 'alert', 'var(--c-warn)');
      return;
    }
    const target = entries.find((e) => e.date === date);
    void bodyRepo.save({ ...(target ? { id: target.id, createdAt: target.createdAt } : { id: bodyId(date) }), date, values }).then(() => {
      // Если дату перенесли, старая запись не должна остаться дублем
      const old = entries.find((e) => e.date === initial);
      if (old && initial !== date) void bodyRepo.remove(old.id);
      toast('Замер сохранён', 'check', 'var(--c-gym)');
      onClose();
    });
  };

  const original = entries.find((e) => e.date === initial);
  return (
    <>
      <Modal
        open
        keepOnOutsideClick
        onClose={onClose}
        title={original ? 'Замер' : 'Новый замер'}
        accent="var(--c-gym)"
        footer={
          <>
            {original && <Button variant="danger" icon="trash" label="Удалить замер" onClick={() => setConfirmDelete(true)} />}
            <Button onClick={onClose}>Отмена</Button>
            <Button variant="primary" onClick={save}>
              Сохранить
            </Button>
          </>
        }
      >
        <DateField label="Дата" value={date} max={todayDate} onChange={changeDate} accent="var(--c-gym)" />
        {existing && date !== initial && <p className={s.hint}>За этот день уже есть замер — правите его.</p>}
        <p className={s.hint}>Заполните только то, что меряли. Обхваты — в сантиметрах.</p>
        <div className={s.metricGrid}>
          {METRIC_IDS.map((id) => {
            const prev = before(id);
            return (
              <TextInput
                key={id}
                label={`${METRICS[id].label}, ${METRICS[id].unit}`}
                inputMode="decimal"
                placeholder={prev === undefined ? '' : `было ${formatValue(prev)}`}
                value={form[id] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
              />
            );
          })}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Удалить замер?"
        action="Удалить"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (original) void bodyRepo.remove(original.id).then(onClose);
        }}
      >
        Замер за {formatDateDay(initial)} пропадёт на всех устройствах.
      </ConfirmDialog>
    </>
  );
}
