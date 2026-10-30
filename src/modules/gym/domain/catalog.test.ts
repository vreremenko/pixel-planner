import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { MUSCLE_IDS } from './muscles';
import { GROUPS } from './types';

describe('справочник упражнений', () => {
  it('id уникальны и в нижнем регистре через дефис', () => {
    const ids = CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
  });
  it('мышцы и группы из списков, основные есть, техника заполнена', () => {
    for (const e of CATALOG) {
      expect(e.primary.length, e.id).toBeGreaterThan(0);
      expect([...e.primary, ...e.secondary].every((m) => MUSCLE_IDS.includes(m)), e.id).toBe(true);
      expect(e.primary.some((m) => e.secondary.includes(m)), e.id).toBe(false);
      expect(Object.keys(GROUPS)).toContain(e.group);
      expect(e.technique.length, e.id).toBeGreaterThanOrEqual(3);
    }
  });
  it('в каждой группе есть упражнения', () => {
    for (const g of Object.keys(GROUPS)) expect(CATALOG.some((e) => e.group === g), g).toBe(true);
  });
});
