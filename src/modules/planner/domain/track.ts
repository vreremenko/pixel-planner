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

/** Блоки после сдвига первого на новое время задачи («HH:MM»); не помещаются в сутки — возвращаются как есть. */
export function alignToTime(blocks: readonly TrackBlock[], time: string): TrackBlock[] {
  const first = blocks[0];
  const [h, m] = time.split(':').map(Number);
  if (!first || h === undefined || m === undefined) return [...blocks];
  const delta = h * 60 + m - first.start;
  const last = blocks[blocks.length - 1] ?? first;
  if (delta === 0 || first.start + delta < 0 || last.end + delta > 1440) return [...blocks];
  return blocks.map((b) => ({ start: b.start + delta, end: b.end + delta }));
}

export interface ShiftItem extends Placed {
  /** Выполненные блоки остаются на месте. */
  fixed: boolean;
}

/**
 * «Сдвинуть остаток дня»: невыполненные блоки, которые ещё не закончились к минуте `now`, переезжают так,
 * чтобы первый начался с ближайшего шага после `now`; промежутки между ними сохраняются, закреплённые блоки обходятся.
 * null — сдвигать нечего; 'overflow' — остаток не помещается до конца суток.
 */
export function shiftRest(all: readonly ShiftItem[], now: number): { delta: number; moves: Record<string, TrackBlock> } | null | 'overflow' {
  const movable = all.filter((b) => !b.fixed && b.end > now).sort((a, z) => a.start - z.start);
  const first = movable[0];
  if (!first) return null;
  const target = Math.ceil(now / STEP) * STEP;
  const delta = target - first.start;
  if (delta <= 0) return null;
  const fixed = all.filter((b) => b.fixed || b.end <= now);
  const moves: Record<string, TrackBlock> = {};
  let cursor = target;
  for (const b of movable) {
    let start = Math.max(b.start + delta, cursor);
    const len = b.end - b.start;
    for (const f of [...fixed].sort((a, z) => a.start - z.start)) if (start < f.end && start + len > f.start) start = f.end;
    if (start + len > 1440) return 'overflow';
    moves[b.key] = { start, end: start + len };
    cursor = start + len;
  }
  return { delta, moves };
}

export const fmtTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function fmtDuration(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return [h ? `${String(h)} ч` : '', r ? `${String(r)} м` : ''].filter(Boolean).join(' ') || '0 м';
}
