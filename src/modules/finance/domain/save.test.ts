import { describe, expect, it } from 'vitest';
import type { Due } from './plan';
import { defaultSaveAccount, linkedSaves, saveAmount, saveOffer, savedInMonth, savingAccounts } from './save';
import { ALL_DAYS, type Account, type Tx } from './types';

const R = 100;
const meta = { createdAt: 0, updatedAt: 0 };
const acc = (id: string, inPlan: boolean, x: Partial<Account> = {}): Account => ({ ...meta, id, name: id, start: 0, inPlan, ...x });
const tx = (x: Partial<Tx>): Tx => ({ ...meta, id: crypto.randomUUID(), date: '2026-11-05', kind: 'transfer', amount: 0, accountId: 'card', ...x });
const due = (date: string, amount: number): Due => ({ paymentId: 'p', name: 'Квартира', date, amount: amount * R, categoryId: 'c' });

describe('откладывание с дохода', () => {
  it('считает процент и округляет до копейки', () => {
    expect(saveAmount(5000 * R, 10)).toBe(500 * R);
    expect(saveAmount(333, 10)).toBe(33);
    expect(saveAmount(5000 * R, 0)).toBe(0);
  });

  it('копилки — живые счета вне плана', () => {
    const list = [acc('card', true), acc('jar', false), acc('old', false, { archived: true })];
    expect(savingAccounts(list).map((a) => a.id)).toEqual(['jar']);
  });

  it('копилка по умолчанию: выбранная, а без неё единственная', () => {
    const one = [acc('card', true), acc('jar', false)];
    const two = [...one, acc('safe', false)];
    expect(defaultSaveAccount(one, {})).toBe('jar');
    expect(defaultSaveAccount(two, {})).toBeUndefined();
    expect(defaultSaveAccount(two, { saveAccountId: 'safe' })).toBe('safe');
    expect(defaultSaveAccount(two, { saveAccountId: 'gone' })).toBeUndefined();
  });

  const dues = [due('2026-11-20', 30_000)];
  const offer = (money: number, income: number, saved: number) => saveOffer(money * R, income * R, saved * R, dues, 0, ALL_DAYS, '2026-11-05');

  it('отмечает, хватает ли на платежи после откладывания', () => {
    expect(offer(28_000, 5000, 500)).toEqual({ covered: true, rate: 0 });
    expect(offer(28_000, 5000, 4000).covered).toBe(false);
  });

  it('показывает, до какой цели вырастет темп', () => {
    const without = offer(20_000, 1000, 0);
    const withSave = offer(20_000, 1000, 100);
    expect(withSave.covered).toBe(false);
    expect(withSave.rate).toBeGreaterThan(without.rate);
    expect(withSave.rate - without.rate).toBeCloseTo((100 * R) / 15);
  });

  it('находит переводы, связанные с доходом, и считает отложенное за месяц', () => {
    const list = [
      tx({ id: 'a', amount: 500 * R, toAccountId: 'jar', fromTxId: 'inc1' }),
      tx({ id: 'b', amount: 300 * R, toAccountId: 'jar', fromTxId: 'inc2', date: '2026-11-20' }),
      tx({ id: 'c', amount: 700 * R, toAccountId: 'jar', fromTxId: 'inc3', date: '2026-10-30' }),
      tx({ id: 'd', amount: 900 * R, toAccountId: 'jar' }),
    ];
    expect(linkedSaves(list, 'inc1').map((t) => t.id)).toEqual(['a']);
    expect(linkedSaves(list, 'none')).toEqual([]);
    expect(savedInMonth(list, 'jar', '2026-11-05')).toBe(800 * R);
    expect(savedInMonth(list, 'other', '2026-11-05')).toBe(0);
  });
});
