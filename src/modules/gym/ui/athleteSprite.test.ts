import { describe, expect, it } from 'vitest';
import { BACK, FRONT, PALETTE, PALETTE_KEYS, SPRITE_H, SPRITE_W } from './athleteSprite';
import { BACK_GRID, FRONT_GRID } from './muscleGrid';

const MASKED = { front: new Set(FRONT_GRID.flat()), back: new Set(BACK_GRID.flat()) };
import { MUSCLE_IDS } from '../domain/muscles';

describe('спрайт атлета и разметка мышц', () => {
  it('размеры и символы спрайта', () => {
    for (const v of [FRONT, BACK]) {
      expect(v).toHaveLength(SPRITE_H);
      expect(v.every((r) => r.length === SPRITE_W)).toBe(true);
      expect(v.join('').replace(/\./g, '').split('').every((c) => PALETTE_KEYS.indexOf(c) >= 0 && PALETTE_KEYS.indexOf(c) < PALETTE.length)).toBe(true);
    }
  });
  it('каждая группа мышц размечена хотя бы на одной стороне', () => {
    expect(MUSCLE_IDS.filter((m) => !MASKED.front.has(m) && !MASKED.back.has(m))).toEqual([]);
  });
});
