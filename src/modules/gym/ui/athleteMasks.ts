/*
 * Разметка мышц на спрайте атлета: координаты центров клеток сетки MASK_W×MASK_H (как в athleteSprite.ts);
 * при перегенерации спрайта с другой клеткой координаты масштабируются. Каждая мышца — эллипсы
 * [cx, cy, rx, ry]; подсвечивается только кожа внутри них (у ягодиц — шорты). При пересечении
 * побеждает мышца, стоящая в списке раньше.
 */
import type { MuscleId } from '../domain/muscles';

export type Ellipse = readonly [number, number, number, number];

export const MASK_W = 68;
export const MASK_H = 123;

/** Левый эллипс и его зеркало справа (ось фигуры — x = 35). */
const pair = (cx: number, cy: number, rx: number, ry: number): Ellipse[] => [
  [cx, cy, rx, ry],
  [70 - cx, cy, rx, ry],
];

export const FRONT_MASKS: readonly [MuscleId, Ellipse[]][] = [
  ['traps', pair(26.5, 20, 4.5, 2.2)],
  ['frontDelts', pair(20.5, 27, 3, 4.5)],
  ['sideDelts', pair(16, 27, 3.5, 5.5)],
  ['chest', pair(28.5, 27, 6, 4.6)],
  ['biceps', pair(17.5, 37, 3.6, 5.5)],
  ['triceps', pair(12.5, 37.5, 1.6, 4.5)],
  ['forearms', pair(12, 46, 4.2, 5)],
  ['lats', pair(22.5, 33.5, 1.5, 2.5)],
  ['abs', [[35, 39, 6.5, 7.5]]],
  ['obliques', pair(24.5, 40, 2.2, 6)],
  ['quads', pair(25, 76, 6.5, 5)],
  ['calves', pair(18, 91.5, 3.5, 6)],
];

export const BACK_MASKS: readonly [MuscleId, Ellipse[]][] = [
  ['traps', [[35, 21, 9, 3.5], [35, 27, 5, 4]]],
  ['rearDelts', pair(20.5, 25.5, 3.5, 3.5)],
  ['sideDelts', pair(14.5, 28, 2.5, 4.5)],
  ['triceps', pair(15.5, 35.5, 4.5, 5.5)],
  ['forearms', pair(10.5, 46, 4, 5.5)],
  ['lats', pair(26.5, 35, 4, 6.5)],
  ['lowerBack', pair(31, 43, 2.8, 5)],
  ['obliques', pair(23.5, 43.5, 2, 4)],
  ['glutes', pair(27, 59, 7.5, 7)],
  ['hamstrings', pair(26, 77.5, 6, 4.5)],
  ['calves', pair(21.5, 92, 6, 6.5)],
];
