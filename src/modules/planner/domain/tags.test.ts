import { describe, expect, it } from 'vitest';
import { groupByTag, hasAllTags, normalizeTag, parseTagInput, tagCounts } from './tags';
import type { RecurringSeries, Task } from './types';

const task = (p: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), createdAt: 0, updatedAt: 0, title: 't', date: '2026-10-29', priority: 'low',
  done: false, order: 0, tags: [], wasInBacklog: false, postponedCount: 0, ...p,
});

describe('нормализация меток', () => {
  it('регистр и «#» не имеют значения', () => {
    expect(normalizeTag(' #Работа ')).toBe('работа');
    expect(parseTagInput('Работа, #дом,  работа , ,#To-Do')).toEqual(['работа', 'дом', 'to-do']);
    expect(parseTagInput('')).toEqual([]);
  });
});

describe('фильтр по меткам', () => {
  it('пустой выбор пропускает всё; несколько меток сужают', () => {
    expect(hasAllTags(['работа'], [])).toBe(true);
    expect(hasAllTags(['Работа', 'срочно'], ['работа'])).toBe(true);
    expect(hasAllTags(['работа'], ['работа', 'срочно'])).toBe(false);
    expect(hasAllTags([], ['работа'])).toBe(false);
  });
});

describe('счётчики меток', () => {
  it('считает по элементам, объединяет регистры, сортирует по частоте', () => {
    expect(tagCounts([['дом'], ['Работа', 'дом'], ['работа', 'работа'], []])).toEqual([
      { tag: 'дом', count: 2 },
      { tag: 'работа', count: 2 },
    ]);
    expect(tagCounts([['б'], ['а'], ['а']])).toEqual([{ tag: 'а', count: 2 }, { tag: 'б', count: 1 }]);
  });
});

describe('страница метки', () => {
  const T = '2026-10-29';
  it('раскладывает задачи по разделам', () => {
    const tasks = [
      task({ id: 'o1', title: 'просрочена', date: '2026-10-20', tags: ['Работа'] }),
      task({ id: 't1', date: T, tags: ['работа'], order: 2 }),
      task({ id: 't2', date: T, tags: ['работа'], order: 1 }),
      task({ id: 'u1', date: '2026-11-05', tags: ['работа'] }),
      task({ id: 'u0', date: '2026-10-31', tags: ['работа'] }),
      task({ id: 'b1', date: null, tags: ['работа'] }),
      task({ id: 'd1', date: '2026-10-01', done: true, doneAt: 100, tags: ['работа'] }),
      task({ id: 'd2', date: '2026-10-02', done: true, doneAt: 200, tags: ['работа'] }),
      task({ id: 'x', tags: ['дом'] }),
      task({ id: 'del', tags: ['работа'], deletedAt: 1 }),
    ];
    const series = [
      { id: 's1', tags: ['работа'], title: 'планёрка' } as RecurringSeries,
      { id: 's2', tags: ['дом'], title: 'полив' } as RecurringSeries,
    ];
    const g = groupByTag(tasks, series, 'Работа', T);
    expect(g.overdue.map((t) => t.id)).toEqual(['o1']);
    expect(g.today.map((t) => t.id)).toEqual(['t2', 't1']);
    expect(g.upcoming.map((t) => t.id)).toEqual(['u0', 'u1']);
    expect(g.backlog.map((t) => t.id)).toEqual(['b1']);
    expect(g.done.map((t) => t.id)).toEqual(['d2', 'd1']);
    expect(g.series.map((s) => s.id)).toEqual(['s1']);
  });
  it('выполненных показывает не больше лимита', () => {
    const tasks = Array.from({ length: 30 }, (_, i) => task({ done: true, doneAt: i, tags: ['а'] }));
    expect(groupByTag(tasks, [], 'а', T, 5).done).toHaveLength(5);
  });
});
