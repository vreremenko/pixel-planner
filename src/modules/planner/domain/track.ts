/* Трек дня: блоки времени задач. Время — минуты от полуночи, шаг сетки STEP. Чистые функции без хранилища. */

/** Один блок задачи на треке (хранится в самой задаче). */
export interface TrackBlock {
  start: number;
  end: number;
}

/** Блок вместе с тем, чей он: key = `${id задачи}:${номер блока}`. */
export interface Placed extends TrackBlock {
  key: string;
}

export const STEP = 15;
/** Рабочие часы трека по умолчанию: подъём и отбой. */
export const DEFAULT_HOURS = { from: 6, to: 23 } as const;

export const snap = (min: number): number => Math.round(min / STEP) * STEP;

/** Блок пересекается с другими (кроме ignore). Касание краями не считается. */
export function overlaps(all: readonly Placed[], start: number, end: number, ignore?: string): boolean {
  return all.some((b) => b.key !== ignore && start < b.end && end > b.start);
}

/** Первое свободное место длиной len в границах [from, to], начиная с минуты `after`; null — нет места. */
export function freeSlot(all: readonly Placed[], len: number, after: number, bounds: { from: number; to: number }): number | null {
  let t = Math.max(bounds.from, after);
  for (const b of [...all].sort((a, z) => a.start - z.start)) {
    if (b.end <= t) continue;
    if (b.start - t >= len) return t;
    t = Math.max(t, b.end);
  }
  return bounds.to - t >= len ? t : null;
}

export type DragMode = 'move' | 'top' | 'bottom';

/**
 * Новое положение блока при сдвиге на delta минут. Блок не выходит за границы и не заезжает на соседей:
 * идём от желаемого сдвига к нулю и берём первый допустимый, поэтому он упирается в соседа, а не перескакивает его.
 */
export function drag(all: readonly Placed[], block: Placed, mode: DragMode, delta: number, bounds: { from: number; to: number }): TrackBlock {
  const calc = (d: number): TrackBlock => (mode === 'move' ? { start: block.start + d, end: block.end + d } : mode === 'top' ? { start: block.start + d, end: block.end } : { start: block.start, end: block.end + d });
  const want = snap(delta);
  for (let d = want; ; d += d > 0 ? -STEP : STEP) {
    const c = calc(d);
    if (c.start >= bounds.from && c.end <= bounds.to && c.end - c.start >= STEP && !overlaps(all, c.start, c.end, block.key)) return c;
    if (d === 0) return { start: block.start, end: block.end };
  }
}

/** Блок можно разрезать, если из него выйдут две части не короче шага. */
export const canSplit = (b: TrackBlock): boolean => b.end - b.start >= 2 * STEP;

/**
 * Разрез посередине: между частями остаётся «окно» (30 минут у блока от полутора часов, иначе шаг),
 * куда можно положить отдых. Общая длина уменьшается на это окно.
 */
export function split(b: TrackBlock): [TrackBlock, TrackBlock] | null {
  if (!canSplit(b)) return null;
  const gap = b.end - b.start >= 90 ? 30 : STEP;
  const mid = b.start + Math.round((b.end - b.start) / 2 / STEP) * STEP;
  const cut = Math.max(b.start + STEP, Math.min(mid, b.end - 2 * STEP));
  const second = Math.min(cut + gap, b.end - STEP);
  return [
    { start: b.start, end: cut },
    { start: second, end: b.end },
  ];
}

export const fmtTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function fmtDuration(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return [h ? `${String(h)} ч` : '', r ? `${String(r)} м` : ''].filter(Boolean).join(' ') || '0 м';
}
