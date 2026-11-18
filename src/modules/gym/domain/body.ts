/* Замеры тела: вес, процент жира и обхваты. Одна запись на день (id = дата), в ней любые из показателей. */
import type { LocalDate, SyncMeta } from '../../../core/domain/types';

export const METRICS = {
  weight: { label: 'Вес', unit: 'кг' },
  fat: { label: 'Жир', unit: '%' },
  neck: { label: 'Шея', unit: 'см' },
  shoulders: { label: 'Плечи', unit: 'см' },
  chest: { label: 'Грудь', unit: 'см' },
  waist: { label: 'Талия', unit: 'см' },
  belly: { label: 'Живот', unit: 'см' },
  hips: { label: 'Ягодицы', unit: 'см' },
  biceps: { label: 'Бицепс', unit: 'см' },
  forearm: { label: 'Предплечье', unit: 'см' },
  thigh: { label: 'Бедро', unit: 'см' },
  calf: { label: 'Икра', unit: 'см' },
} as const;

export type MetricId = keyof typeof METRICS;
export const METRIC_IDS = Object.keys(METRICS) as MetricId[];
export type BodyValues = Partial<Record<MetricId, number>>;

export interface BodyEntry extends SyncMeta {
  date: LocalDate;
  values: BodyValues;
}

/** id записи за день: два устройства, записавшие замер в один день, правят одну запись, а не плодят две. */
export const bodyId = (date: LocalDate) => `body-${date}`;

/** Только известные показатели с разумными положительными значениями. */
export function cleanValues(v: Record<string, number | null | undefined>): BodyValues {
  const out: BodyValues = {};
  for (const id of METRIC_IDS) {
    const n = v[id];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1000) out[id] = Math.round(n * 100) / 100;
  }
  return out;
}

export interface MetricPoint {
  date: LocalDate;
  value: number;
}

/** Значения показателя по датам, по возрастанию. */
export function seriesOf(entries: readonly BodyEntry[], id: MetricId): MetricPoint[] {
  return entries
    .flatMap((e) => (e.values[id] === undefined ? [] : [{ date: e.date, value: e.values[id] }]))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface MetricSummary {
  id: MetricId;
  last: MetricPoint;
  /** Предыдущий замер этого показателя (для изменения). */
  prev?: MetricPoint;
  /** Первый замер (для «с начала»). */
  first: MetricPoint;
}

/** Последнее значение каждого показателя, который хоть раз записывали, в порядке METRICS. */
export function summaries(entries: readonly BodyEntry[]): MetricSummary[] {
  return METRIC_IDS.flatMap((id) => {
    const s = seriesOf(entries, id);
    const last = s.at(-1);
    const first = s[0];
    return last && first ? [{ id, last, prev: s.at(-2), first }] : [];
  });
}

/** Изменение со знаком: «+1.5», «−0.8», «0». */
export function formatDelta(d: number): string {
  const r = Math.round(d * 10) / 10;
  if (r === 0) return '0';
  return `${r > 0 ? '+' : '−'}${String(Math.abs(r))}`;
}
