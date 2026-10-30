import { describe, expect, it } from 'vitest';
import { ANIMS } from './index';
import { CATALOG } from '../../domain/catalog';
import { ALPHA } from '../alphabet';

describe('анимации упражнений', () => {
  it('есть только у упражнений из справочника, кадры одного размера и из палитры', async () => {
    for (const [id, load] of Object.entries(ANIMS)) {
      expect(CATALOG.some((e) => e.id === id), id).toBe(true);
      const a = await load();
      expect(a.FRAMES.length).toBeGreaterThanOrEqual(2);
      for (const f of a.FRAMES) {
        expect(f).toHaveLength(a.H);
        expect(f.every((r) => r.length === a.W)).toBe(true);
        expect(f.join('').replace(/\./g, '').split('').every((c) => ALPHA.indexOf(c) >= 0 && ALPHA.indexOf(c) < a.PALETTE.length)).toBe(true);
      }
    }
  });
});
