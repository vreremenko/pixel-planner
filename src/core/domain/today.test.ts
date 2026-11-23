import { describe, expect, it } from 'vitest';
import type { TodayItem } from '../module';
import { daySections, nextUp, relativeTime } from './today';

const item = (id: string, o: Partial<TodayItem> = {}): TodayItem => ({ id, title: id, done: false, to: '/', icon: 'star', accent: 'x', ...o });

describe('«Сегодня»', () => {
  const items = [
    item('без времени'),
    item('вечер', { time: '19:00' }),
    item('утро', { time: '07:30', done: true }),
    item('обед', { time: '13:00' }),
    item('привычка'),
  ];

  it('ближайшее: сначала по времени, сделанное не показываем, не больше двух', () => {
    expect(nextUp(items).map((i) => i.id)).toEqual(['обед', 'вечер']);
  });

  it('если со временем меньше двух — добираем дела без времени', () => {
    expect(nextUp([item('а'), item('б', { time: '10:00' }), item('в')]).map((i) => i.id)).toEqual(['б', 'а']);
    expect(nextUp([item('а'), item('б'), item('в')]).map((i) => i.id)).toEqual(['а', 'б']);
  });

  it('просроченное остаётся наверху, пока не сделано', () => {
    expect(nextUp([item('поздно', { time: '20:00' }), item('давно', { time: '08:00' })]).map((i) => i.id)).toEqual(['давно', 'поздно']);
  });

  it('весь день: по времени, без времени отдельно, сделанное отдельно', () => {
    const s = daySections(items);
    expect(s.timed.map((i) => i.id)).toEqual(['обед', 'вечер']);
    expect(s.untimed.map((i) => i.id)).toEqual(['без времени', 'привычка']);
    expect(s.done.map((i) => i.id)).toEqual(['утро']);
  });

  it('пустой день — пустые разделы', () => {
    expect(nextUp([])).toEqual([]);
    expect(daySections([])).toEqual({ timed: [], untimed: [], done: [] });
  });

  it('сколько до дела словами', () => {
    const now = 12 * 60;
    expect(relativeTime('12:40', now)).toBe('через 40 мин');
    expect(relativeTime('14:00', now)).toBe('через 2 ч');
    expect(relativeTime('13:20', now)).toBe('через 1 ч 20 мин');
    expect(relativeTime('12:00', now)).toBe('сейчас');
    expect(relativeTime('09:30', now)).toBe('просрочено на 2 ч 30 мин');
    expect(relativeTime(undefined, now)).toBe('без времени');
  });
});
