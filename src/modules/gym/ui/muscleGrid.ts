/* Цвета и разметка мышц на спрайте атлета (без React): какая мышца в каждой клетке и как её подсветить. */
import type { MuscleId } from '../domain/muscles';
import { BACK, FRONT, PALETTE, PALETTE_KEYS, SPRITE_H, SPRITE_W } from './athleteSprite';
import { BACK_MASKS, FRONT_MASKS, MASK_H, MASK_W, type Ellipse } from './athleteMasks';

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
export const COLORS = PALETTE.map(rgb);
const lum = ([r, g, b]: Rgb) => 0.3 * r + 0.59 * g + 0.11 * b;
/** Кожа (а не контур, волосы, шорты или бинты) — только её красим под мышцей. */
const isSkin = (c: Rgb) => lum(c) >= 55 && c[0] > c[2] + 20 && !(Math.abs(c[0] - c[1]) < 25 && Math.abs(c[1] - c[2]) < 25);
const isShorts = (c: Rgb) => c[2] > c[0] + 10;

/**
 * Основные мышцы — красный, вспомогательные — фиолетовый (оранжевый сливается с загорелой кожей).
 * Цвет насыщенный, а светотень исходного пикселя сохраняется — рельеф мышц виден и под подсветкой.
 */
export const PRIMARY_COLOR = '#ff1e32';
export const SECONDARY_COLOR = '#a855ff';
export const PRIMARY = rgb(PRIMARY_COLOR);
export const SECONDARY = rgb(SECONDARY_COLOR);
export function tint(c: Rgb, to: Rgb): string {
  const k = 0.45 + (0.95 * lum(c)) / 255;
  return `rgb(${to.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
}

/** Какая мышца в каждой клетке (по разметке); undefined — нет мышцы. */
function maskGrid(rows: readonly string[], masks: readonly [MuscleId, Ellipse[]][]): (MuscleId | undefined)[][] {
  return rows.map((row, y) =>
    Array.from({ length: row.length }, (_, x) => {
      const ch = row.charAt(x);
      if (ch === '.') return undefined;
      const c = COLORS[PALETTE_KEYS.indexOf(ch)];
      if (!c) return undefined;
      for (const [id, ells] of masks) {
        if (!(isSkin(c) || (id === 'glutes' && isShorts(c)))) continue;
        // Координаты разметки — в сетке MASK_W×MASK_H, спрайт может быть другого размера
        const mx = ((x + 0.5) * MASK_W) / SPRITE_W;
        const my = ((y + 0.5) * MASK_H) / SPRITE_H;
        if (ells.some(([cx, cy, rx, ry]) => ((mx - cx) / rx) ** 2 + ((my - cy) / ry) ** 2 <= 1)) return id;
      }
      return undefined;
    }),
  );
}
export const FRONT_GRID = maskGrid(FRONT, FRONT_MASKS);
export const BACK_GRID = maskGrid(BACK, BACK_MASKS);
/** Мышцы, которые видны только со спины. */
export const BACK_ONLY = new Set<MuscleId>(['rearDelts', 'lowerBack', 'glutes', 'hamstrings']);

