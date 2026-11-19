import { describe, expect, it } from 'vitest';
import { moveCategory, nextOrder, sortCategories, visibleCategories } from './categories';
import { DEFAULT_CATEGORIES, type Category } from './types';

const defaults = DEFAULT_CATEGORIES.map((c): Category => ({ ...c, createdAt: 0, updatedAt: 0 }));
const mine = (id: string, name: string, createdAt: number, extra: Partial<Category> = {}): Category => ({ id, name, kind: 'expense', createdAt, updatedAt: createdAt, ...extra });
const names = (list: Category[]) => list.map((c) => c.name);

describe('порядок категорий', () => {
  it('по умолчанию: стартовые по порядку, свои — за ними по времени создания', () => {
    const list = [mine('b', 'Бензин', 20), ...defaults, mine('a', 'Аптека', 10)];
    const exp = visibleCategories(list, 'expense');
    expect(names(exp).slice(0, 2)).toEqual(['Продукты', 'Кафе']);
    expect(names(exp).slice(-2)).toEqual(['Аптека', 'Бензин']);
  });

  it('перестановка задаёт явный порядок всем видимым того же вида', () => {
    const list = [...defaults, mine('a', 'Аптека', 10)];
    const changed = moveCategory(list, 'a', 0);
    const merged = list.map((c) => changed.find((x) => x.id === c.id) ?? c);
    expect(names(visibleCategories(merged, 'expense')).slice(0, 3)).toEqual(['Аптека', 'Продукты', 'Кафе']);
    // Доходы не трогаем
    expect(changed.every((c) => c.kind === 'expense')).toBe(true);
    // Вниз за край — просто в конец
    const down = moveCategory(merged, 'def:food', 99);
    expect(names(visibleCategories(merged.map((c) => down.find((x) => x.id === c.id) ?? c), 'expense')).at(-1)).toBe('Продукты');
  });

  it('скрытые не участвуют в порядке, новая встаёт в конец', () => {
    const list = [...defaults, mine('a', 'Аптека', 10, { archived: true })];
    expect(visibleCategories(list, 'expense').some((c) => c.id === 'a')).toBe(false);
    expect(visibleCategories(list, 'expense', 'a').some((c) => c.id === 'a')).toBe(true);
    expect(nextOrder(list, 'expense')).toBe(DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense').length);
    expect(sortCategories([mine('x', 'X', 1, { order: 0 }), mine('y', 'Y', 0, { order: 5 })]).map((c) => c.id)).toEqual(['x', 'y']);
  });
});
