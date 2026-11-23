import { describe, expect, it } from 'vitest';
import { DAY_SORTS, sortDay, sortLabel, type Sortable } from './daySort';

const item = (name: string, o: Partial<Sortable> = {}) => ({ name, view: { order: 0, priority: 'medium' as const, done: false, ...o } });
const names = (mode: Parameters<typeof sortDay>[1], list: ReturnType<typeof item>[]) => sortDay(list, mode, (x) => x.view).map((x) => x.name);

const list = [
  item('хлеб', { order: 0, priority: 'low' }),
  item('созвон', { order: 1, time: '15:30', priority: 'high' }),
  item('маме', { order: 2, time: '19:00' }),
  item('зарядка', { order: 3, time: '07:30', done: true }),
  item('отчёт', { order: 4, time: '12:00', priority: 'high' }),
];

describe('порядок задач дня', () => {
  it('по времени: ближайшее сверху, без времени — в конце', () => {
    expect(names('time', list)).toEqual(['зарядка', 'отчёт', 'созвон', 'маме', 'хлеб']);
  });

  it('вручную: как расставлено перетаскиванием', () => {
    expect(names('manual', list)).toEqual(['хлеб', 'созвон', 'маме', 'зарядка', 'отчёт']);
  });

  it('по важности: сначала высокая, внутри — по времени', () => {
    expect(names('priority', list)).toEqual(['отчёт', 'созвон', 'зарядка', 'маме', 'хлеб']);
  });

  it('сначала несделанные: сделанные уходят вниз, остальное — по времени', () => {
    expect(names('pending', list)).toEqual(['отчёт', 'созвон', 'маме', 'хлеб', 'зарядка']);
  });

  it('при одинаковом времени сохраняется ручной порядок', () => {
    const same = [item('б', { order: 1, time: '10:00' }), item('а', { order: 0, time: '10:00' })];
    expect(names('time', same)).toEqual(['а', 'б']);
  });

  it('не меняет исходный список', () => {
    const copy = [...list];
    sortDay(list, 'time', (x) => x.view);
    expect(list).toEqual(copy);
  });

  it('«Вручную» нет в меню: после перетаскивания не отмечен ни один пункт, подпись — «Свой порядок»', () => {
    expect(DAY_SORTS.map((o) => o.value)).toEqual(['time', 'pending', 'priority']);
    expect(DAY_SORTS.some((o) => o.value === ('manual' as string))).toBe(false);
    expect(sortLabel('manual')).toBe('Свой порядок');
    expect(sortLabel('time')).toBe('По времени');
  });
});
