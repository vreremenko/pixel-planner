import { describe, expect, it } from 'vitest';
import type { Account, Payment, Tx } from './types';
import { ALL_DAYS } from './types';
import { balances, dayPlan, livingAverage, occurrences, openDues, pace, type Due } from './plan';
import { byCategory, lastMonths, totals } from './stats';
import { rub, rubUp, toKopecks } from './money';

const R = 100;
const due = (name: string, date: string, amount: number): Due => ({ paymentId: name, name, date, amount: amount * R, categoryId: 'c' });
const meta = { createdAt: 0, updatedAt: 0 };
const tx = (x: Partial<Tx>): Tx => ({ ...meta, id: crypto.randomUUID(), date: '2026-11-05', kind: 'expense', amount: 0, accountId: 'a', ...x });
const pay = (x: Partial<Payment>): Payment => ({ ...meta, id: 'p', name: 'Квартира', amount: 30_000 * R, categoryId: 'c', repeat: 'month', date: '2026-10-20', skipped: [], ...x });
const dues = [due('Подписка', '2026-11-12', 500), due('Квартира', '2026-11-20', 30_000)];
const base = { today: '2026-11-05', money: 8000 * R, living: 800 * R, work: ALL_DAYS, dues, todayTx: [] as Tx[] };

describe('дневная цель', () => {
  it('считает пример из плана и называет тесный срок', () => {
    const p = dayPlan(base);
    expect(p.target).toBe(2300 * R);
    expect(p.left).toBe(2300 * R);
    expect(p.tightest?.name).toBe('Квартира');
  });

  it('заработав ровно цель, завтра получаем ту же цель', () => {
    const p = dayPlan({ ...base, money: base.money + 2300 * R, todayTx: [tx({ kind: 'income', amount: 2300 * R })] });
    expect(p.left).toBe(0);
    expect(p.next).toBeCloseTo(2300 * R);
  });

  it('перевод в копилку не двигает цель и не считается заработанным', () => {
    const plain = dayPlan(base);
    const income = tx({ kind: 'income', amount: 1000 * R });
    const saved = dayPlan({ ...base, money: base.money + 900 * R, todayTx: [income], netIn: -100 * R });
    expect(saved.target).toBe(plain.target);
    expect(saved.earned).toBe(900 * R);
    expect(saved.left).toBe(plain.target - 900 * R);
  });

  it('перевод из копилки в план уменьшает остаток цели, а без дохода заработанное не уходит в минус', () => {
    const back = dayPlan({ ...base, money: base.money + 500 * R, todayTx: [], netIn: 500 * R });
    expect(back.target).toBe(dayPlan(base).target);
    expect(back.left).toBe(dayPlan(base).target - 500 * R);
    const out = dayPlan({ ...base, money: base.money - 500 * R, todayTx: [], netIn: -500 * R });
    expect(out.earned).toBe(0);
    expect(out.left).toBe(dayPlan(base).target + 500 * R);
  });

  it('доход сверх цели снижает темп, а цель дня не трогает', () => {
    const p = dayPlan({ ...base, money: base.money + 5000 * R, todayTx: [tx({ kind: 'income', amount: 5000 * R })] });
    expect(p.target).toBe(2300 * R);
    expect(p.next).toBeLessThan(2300 * R);
  });

  it('траты в пределах суммы на жизнь цель не меняют, перерасход её увеличивает', () => {
    const spend = (v: number) => dayPlan({ ...base, money: base.money - v * R, todayTx: [tx({ amount: v * R })] }).target;
    expect(spend(500)).toBe(2300 * R);
    expect(spend(1800)).toBe(3300 * R);
  });

  it('ранний тесный срок важнее позднего', () => {
    const p = pace(0, [due('Скоро', '2026-11-07', 10_000), due('Потом', '2026-12-01', 11_000)], 0, ALL_DAYS, '2026-11-05');
    expect(p.tightest?.name).toBe('Скоро');
    expect(p.rate).toBe(5000 * R);
  });

  it('делит только на рабочие дни, а на жизнь считает все', () => {
    // 2 ноября 2026 — понедельник; до следующего понедельника 5 рабочих дней и 7 календарных
    const p = pace(0, [due('Счёт', '2026-11-09', 1000)], 100 * R, [0, 1, 2, 3, 4], '2026-11-02');
    expect(p.rate).toBe(((1000 + 700) / 5) * R);
  });

  it('в выходной цели нет, но темп остаётся', () => {
    const p = dayPlan({ ...base, today: '2026-11-07', work: [0, 1, 2, 3, 4] });
    expect(p.dayOff).toBe(true);
    expect(p.left).toBe(0);
    expect(p.next).toBeGreaterThan(0);
  });

  it('просроченный срок требует денег сегодня', () => {
    const p = pace(100 * R, [due('Долг', '2026-11-01', 1000)], 0, ALL_DAYS, '2026-11-05');
    expect(p.rate).toBe(900 * R);
    expect(p.shortNow).toBe(900 * R);
  });

  it('денег хватает: цель ноль и свободная сумма по самому тесному сроку', () => {
    const p = dayPlan({ ...base, money: 50_000 * R });
    expect(p.left).toBe(0);
    expect(p.free).toBe((50_000 - 30_500 - 800 * 15) * R);
    expect(p.covered.size).toBe(2);
  });

  it('оплата срока сегодня не меняет цель дня', () => {
    const paid = tx({ amount: 500 * R, paymentId: 'Подписка', dueDate: '2026-11-12' });
    const p = dayPlan({ ...base, money: base.money - 500 * R, dues: dues.slice(1), todayTx: [paid] });
    expect(p.target).toBe(2300 * R);
  });

  it('без платежей цели нет', () => {
    expect(dayPlan({ ...base, dues: [] }).left).toBe(0);
  });
});

describe('сроки платежей', () => {
  it('31-е в коротком месяце становится последним днём и потом возвращается', () => {
    expect(occurrences(pay({ date: '2026-01-31' }), '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-31']);
  });

  it('раз в неделю, раз в год и разово', () => {
    expect(occurrences(pay({ repeat: 'week', date: '2026-11-02' }), '2026-11-05', '2026-11-20')).toEqual(['2026-11-09', '2026-11-16']);
    expect(occurrences(pay({ repeat: 'year', date: '2025-11-10' }), '2026-01-01', '2027-12-31')).toEqual(['2026-11-10', '2027-11-10']);
    expect(occurrences(pay({ repeat: 'once', date: '2026-11-10' }), '2026-12-01', '2026-12-31')).toEqual([]);
  });

  it('оплаченный и пропущенный сроки уходят, удалённая оплата возвращает срок', () => {
    const p = pay({ skipped: ['2026-12-20'] });
    const paid = tx({ paymentId: 'p', dueDate: '2026-11-20' });
    expect(openDues([p], [], '2026-11-05').map((d) => d.date)).toEqual(['2026-10-20', '2026-11-20']);
    expect(openDues([p], [paid, tx({ paymentId: 'p', dueDate: '2026-10-20' })], '2026-11-25').map((d) => d.date)).toEqual([]);
  });
});

describe('деньги', () => {
  const acc = (id: string, start: number): Account => ({ ...meta, id, name: id, start: start * R, inPlan: true });

  it('балансы складываются из операций, перевод сумму не меняет', () => {
    const list = [tx({ kind: 'income', amount: 100 * R }), tx({ amount: 30 * R }), tx({ kind: 'transfer', amount: 50 * R, toAccountId: 'b' })];
    const b = balances([acc('a', 10), acc('b', 0)], list);
    expect(b.get('a')).toBe(30 * R);
    expect(b.get('b')).toBe(50 * R);
  });

  it('среднее на жизнь без платежей; при короткой истории его нет', () => {
    const list = [tx({ date: '2026-10-26', amount: 1000 * R }), tx({ date: '2026-11-01', amount: 1000 * R }), tx({ date: '2026-11-01', amount: 9000 * R, paymentId: 'p' }), tx({ date: '2026-11-05', amount: 7000 * R })];
    expect(livingAverage(list, '2026-11-05')).toBe(200 * R);
    expect(livingAverage(list.slice(1), '2026-11-05')).toBeNull();
  });

  it('разбирает и показывает суммы', () => {
    expect(toKopecks('1250,5')).toBe(125_050);
    expect(toKopecks('abc')).toBeNull();
    expect(rub(125_050).replace(/\s/g, ' ')).toBe('1 250,50 ₽');
    expect(rubUp(100_001).replace(/\s/g, ' ')).toBe('1 001 ₽');
  });

  it('статистика считает итоги, доли и месяцы', () => {
    const list = [tx({ amount: 300, categoryId: 'a' }), tx({ amount: 100, categoryId: 'b' }), tx({ kind: 'income', amount: 500 }), tx({ kind: 'transfer', amount: 999 })];
    expect(totals(list)).toEqual({ income: 500, expense: 400 });
    expect(byCategory(list, 'expense')[0]).toEqual({ categoryId: 'a', sum: 300, share: 0.75 });
    expect(lastMonths('2026-02-15', 3)).toEqual(['2025-12-01', '2026-01-01', '2026-02-01']);
  });
});
