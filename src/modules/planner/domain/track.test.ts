import { describe, expect, it } from 'vitest';
import { alignToTime, canSplit, drag, fmtDuration, freeSlot, overlaps, shiftRest, split, type Placed } from './track';

const H = (h: number, m = 0) => h * 60 + m;
const p = (key: string, s: number, e: number): Placed => ({ key, start: s, end: e });
const bounds = { from: H(6), to: H(23) };

describe('трек дня: свободное место и пересечения', () => {
  const all = [p('a', H(9), H(11)), p('b', H(11), H(11, 30)), p('c', H(12), H(13))];
  it('касание краями — не пересечение', () => {
    expect(overlaps(all, H(11, 30), H(12))).toBe(false);
    expect(overlaps(all, H(10), H(10, 30))).toBe(true);
    expect(overlaps(all, H(9), H(11), 'a')).toBe(false);
  });
  it('первое свободное место: с начала дня, после минуты, в окне между блоками', () => {
    expect(freeSlot(all, 60, 0, bounds)).toBe(H(6));
    expect(freeSlot(all, 4 * 60, 0, bounds)).toBe(H(13));
    expect(freeSlot(all, 30, H(11), bounds)).toBe(H(11, 30));
    expect(freeSlot(all, 60, H(11), bounds)).toBe(H(13));
  });
  it('нет места — null', () => {
    expect(freeSlot([p('x', H(6), H(23))], 15, 0, bounds)).toBeNull();
  });
});

describe('трек дня: перетаскивание и растягивание', () => {
  const all = [p('a', H(9), H(11)), p('b', H(12), H(13))];
  it('сдвиг по шагу и округление', () => {
    expect(drag(all, all[0]!, 'move', -60, bounds)).toEqual({ start: H(8), end: H(10) });
    expect(drag(all, all[0]!, 'move', -52, bounds)).toEqual({ start: H(8, 15), end: H(10, 15) });
  });
  it('блок упирается в соседа и в границы, не перескакивая', () => {
    expect(drag(all, all[0]!, 'move', 180, bounds)).toEqual({ start: H(10), end: H(12) });
    expect(drag(all, all[0]!, 'move', -600, bounds)).toEqual({ start: H(6), end: H(8) });
  });
  it('растягивание за края, минимум один шаг', () => {
    expect(drag(all, all[0]!, 'bottom', 60, bounds)).toEqual({ start: H(9), end: H(12) });
    expect(drag(all, all[0]!, 'top', -30, bounds)).toEqual({ start: H(8, 30), end: H(11) });
    expect(drag(all, all[0]!, 'bottom', -600, bounds)).toEqual({ start: H(9), end: H(9, 15) });
  });
});

describe('трек дня: разрез', () => {
  it('часть блока от полутора часов — окно в 30 минут', () => {
    expect(split({ start: H(9), end: H(11) })).toEqual([{ start: H(9), end: H(10) }, { start: H(10, 30), end: H(11) }]);
  });
  it('короткий блок — окно в шаг', () => {
    expect(split({ start: H(9), end: H(10) })).toEqual([{ start: H(9), end: H(9, 30) }, { start: H(9, 45), end: H(10) }]);
  });
  it('слишком короткий не режется', () => {
    expect(canSplit({ start: H(9), end: H(9, 15) })).toBe(false);
    expect(split({ start: H(9), end: H(9, 15) })).toBeNull();
    expect(split({ start: H(9), end: H(9, 30) })).toEqual([{ start: H(9), end: H(9, 15) }, { start: H(9, 15), end: H(9, 30) }]);
  });
});

describe('трек дня: подписи', () => {
  it('длительность', () => {
    expect([30, 60, 90, 135].map(fmtDuration)).toEqual(['30 м', '1 ч', '1 ч 30 м', '2 ч 15 м']);
  });
});

describe('трек дня: время задачи и сдвиг остатка', () => {
  it('блоки едут за новым временем задачи, если помещаются в сутки', () => {
    const blocks = [{ start: H(9), end: H(10) }, { start: H(11), end: H(12) }];
    expect(alignToTime(blocks, '10:30')).toEqual([{ start: H(10, 30), end: H(11, 30) }, { start: H(12, 30), end: H(13, 30) }]);
    expect(alignToTime(blocks, '23:30')).toEqual(blocks);
  });
  const it_ = (key: string, s: number, e: number, fixed = false) => ({ key, start: s, end: e, fixed });
  it('первый невыполненный блок встаёт на ближайший шаг после «сейчас», промежутки сохраняются', () => {
    const r = shiftRest([it_('a', H(9), H(10), true), it_('b', H(10), H(11)), it_('c', H(12), H(13))], H(10, 20));
    expect(r).toEqual({ delta: 30, moves: { b: { start: H(10, 30), end: H(11, 30) }, c: { start: H(12, 30), end: H(13, 30) } } });
  });
  it('нечего сдвигать, если план не отстал', () => {
    expect(shiftRest([it_('b', H(11), H(12))], H(10))).toBeNull();
    expect(shiftRest([it_('a', H(9), H(10), true)], H(12))).toBeNull();
  });
  it('закреплённый блок в будущем обходится, не влезающее до полуночи — overflow', () => {
    const r = shiftRest([it_('b', H(10), H(11)), it_('x', H(11), H(12), true)], H(10, 15));
    expect(r).toEqual({ delta: 15, moves: { b: { start: H(12), end: H(13) } } });
    expect(shiftRest([it_('b', H(20), H(23))], H(22))).toBe('overflow');
  });
});
