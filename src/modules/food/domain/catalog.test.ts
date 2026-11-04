import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';

describe('справочник еды', () => {
  it('имена уникальны, значения правдоподобны', () => {
    expect(new Set(CATALOG.map((f) => f.name)).size).toBe(CATALOG.length);
    expect(CATALOG.length).toBeGreaterThanOrEqual(300);
    for (const f of CATALOG) {
      expect(f.protein + f.fat + f.carbs, f.name).toBeLessThanOrEqual(100.5);
      // В алкоголе калории дают не БЖУ
      if (/^(Вино|Пиво)/.test(f.name)) continue;
      // Калории близки к расчётным 4/9/4: опечатка в значении даст большой разрыв
      const calc = f.protein * 4 + f.fat * 9 + f.carbs * 4;
      expect(Math.abs(f.kcal - calc), f.name).toBeLessThanOrEqual(Math.max(30, f.kcal * 0.22));
    }
  });
});
