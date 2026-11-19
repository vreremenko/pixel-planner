/*
 * Вес хранится в одном месте — в «Замерах» (таблица gym_body раздела тренировок). Питание его только читает
 * и, когда вес вводят в «Цели на день», записывает туда же. Таблицу берём через базу, не завися от раздела.
 */
import { db } from '../../../core/data/db';
import { alive } from '../../../core/data/repo';
import type { LocalDate, SyncMeta } from '../../../core/domain/types';

interface BodyRow extends SyncMeta {
  date: LocalDate;
  values: Record<string, number | undefined>;
}

const table = () => db.table<BodyRow, string>('gym_body');
/** Тот же id, что у «Замеров» (gym/domain/body.ts): одна запись на день. */
const bodyId = (date: LocalDate) => `body-${date}`;

export interface WeightPoint {
  date: LocalDate;
  value: number;
}

/** Все взвешивания по датам. */
export async function weights(): Promise<WeightPoint[]> {
  return (await table().toArray())
    .filter(alive)
    .flatMap((b) => (typeof b.values.weight === 'number' ? [{ date: b.date, value: b.values.weight }] : []))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function latestWeight(): Promise<WeightPoint | undefined> {
  return (await weights()).at(-1);
}

/** Записать вес за день в «Замеры», не трогая обхваты этого дня. */
export async function saveWeight(date: LocalDate, value: number): Promise<void> {
  const id = bodyId(date);
  const cur = await table().get(id);
  const now = Date.now();
  const base = cur && !cur.deletedAt ? cur : { id, date, values: {}, createdAt: now };
  await table().put({ ...base, values: { ...base.values, weight: Math.round(value * 100) / 100 }, updatedAt: now });
}
