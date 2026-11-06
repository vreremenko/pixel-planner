import { describe, expect, it } from 'vitest';
import type { Due } from './plan';
import { rub } from './money';
import { tips, type TipInput } from './tips';
import { GENERAL_TIPS } from './tipsList';
import type { Tx } from './types';

const R = 100;
const meta = { createdAt: 0, updatedAt: 0 };
const due = (name: string, date: string, amount: number): Due => ({ paymentId: name, name, date, amount: amount * R, categoryId: 'c' });
const tx = (x: Partial<Tx>): Tx => ({ ...meta, id: crypto.randomUUID(), date: '2026-11-05', kind: 'expense', amount: 0, accountId: 'a', ...x });
const base: TipInput = { today: '2026-11-05', money: 0, living: 800 * R, dues: [], covered: true, txs: [], categories: [{ id: 'cafe', name: 'Кафе' }], savePercent: 10 };
const personal = (x: Partial<TipInput>) => tips({ ...base, ...x }).filter((t) => !GENERAL_TIPS.includes(t));

describe('советы по данным', () => {
  it('без данных остаются только общие советы', () => {
    expect(personal({})).toEqual([]);
    expect(tips(base)).toHaveLength(GENERAL_TIPS.length);
  });

  it('ставит подсказки от срочного к полезному, общие в конце', () => {
    const list = tips({ ...base, living: 0, covered: false, dues: [due('Старый', '2026-11-01', 100), due('Юристы', '2026-11-15', 17_000)] });
    expect(list[0]).toContain('Старый');
    expect(list[0]).toContain('срок прошёл');
    expect(list[1]).toContain('Обычные траты пока не в плане');
    expect(list[2]).toContain('Юристы');
    expect(GENERAL_TIPS).toContain(list[3]);
  });

  it('считает нехватку по примеру со снимка', () => {
    const dues = [due('Юристы', '2026-11-15', 17_000), due('Учёба', '2026-11-19', 10_000)];
    expect(personal({ today: '2026-11-07', money: 802_255, living: 0, covered: false, dues })[1]).toBe(`«Юристы»: через 8 дней, не хватает ${rub(897_800)}.`);
  });

  it('ближайшая нехватка учитывает ранние платежи и жизнь', () => {
    const dues = [due('Подписка', '2026-11-06', 100), due('Квартира', '2026-11-08', 1000)];
    expect(personal({ money: 3000 * R, covered: false, dues })).toEqual([`«Квартира»: через 3 дня, не хватает ${rub(500 * R)}.`]);
  });

  it('называет близкие сроки словами', () => {
    expect(personal({ covered: false, dues: [due('A', '2026-11-05', 100)] })[0]).toContain('сегодня');
    expect(personal({ covered: false, dues: [due('A', '2026-11-06', 100)] })[0]).toContain('завтра');
    expect(personal({ covered: false, dues: [due('A', '2026-11-26', 100)] })[0]).toContain('через 21 день');
  });

  it('советует отложить со свежего дохода только при покрытом плане', () => {
    const txs = [tx({ kind: 'income', amount: 1000 * R, date: '2026-11-01' }), tx({ kind: 'income', amount: 5000 * R, date: '2026-11-04' })];
    expect(personal({ txs })).toEqual([`Пришло ${rub(5000 * R)}. Если отложить 10%, это ${rub(500 * R)}.`]);
    expect(personal({ txs, savePercent: 20 })[0]).toContain(rub(1000 * R));
    expect(personal({ txs, covered: false })).toEqual([]);
    expect(personal({ txs, savePercent: 0 })).toEqual([]);
    expect(personal({ txs, today: '2026-11-08' })).toEqual([]);
  });

  const cafe = (date: string, amount: number, x: Partial<Tx> = {}) => tx({ date, amount: amount * R, categoryId: 'cafe', ...x });

  it('замечает рост расходов выше обоих порогов', () => {
    const txs = [cafe('2026-10-03', 2000), cafe('2026-11-03', 3000)];
    expect(personal({ txs })).toEqual([`«Кафе»: ${rub(3000 * R)} с начала месяца, на ${rub(1000 * R)} больше, чем за те же дни прошлого.`]);
  });

  it('молчит, если рост мал в доле, в рублях или сравнивать не с чем', () => {
    expect(personal({ txs: [cafe('2026-10-03', 5000), cafe('2026-11-03', 6000)] })).toEqual([]);
    expect(personal({ txs: [cafe('2026-10-03', 100), cafe('2026-11-03', 900)] })).toEqual([]);
    expect(personal({ txs: [cafe('2026-11-03', 9000)] })).toEqual([]);
  });

  it('сравнивает те же дни и не считает обязательные платежи', () => {
    expect(personal({ txs: [cafe('2026-10-03', 2000), cafe('2026-10-20', 9000), cafe('2026-11-03', 3000)] })).toHaveLength(1);
    expect(personal({ txs: [cafe('2026-10-03', 2000), cafe('2026-11-03', 3000, { paymentId: 'p' })] })).toEqual([]);
  });
});

describe('общие советы', () => {
  it('другая дата начинает список с другого совета, но весь список на месте', () => {
    const a = tips(base);
    const b = tips({ ...base, today: '2026-11-06' });
    expect(a[0]).not.toBe(b[0]);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('работает и для дат раньше точки отсчёта', () => {
    expect(tips({ ...base, today: '2025-12-30' })).toHaveLength(GENERAL_TIPS.length);
  });
});
