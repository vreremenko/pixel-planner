import { describe, expect, it } from 'vitest';
import { ALL_DAYS, type Goal, type Tx } from './types';
import { applyGoal, goalView, movedToday } from './goals';

const R = 100;
const meta = { createdAt: 0, updatedAt: 0 };
const goal = (x: Partial<Goal> = {}): Goal => ({ ...meta, id: 'g', name: 'Компьютер', amount: 100_000 * R, date: '2026-12-01', accountId: 'jar', startDate: '2026-11-01', startSaved: 20_000 * R, ...x });
const tx = (x: Partial<Tx>): Tx => ({ ...meta, id: crypto.randomUUID(), date: '2026-11-11', kind: 'transfer', amount: 0, accountId: 'card', ...x });
const today = '2026-11-11';

describe('цель на день', () => {
  it('делит остаток на рабочие дни до даты', () => {
    expect(goalView(goal(), 40_000 * R, 0, ALL_DAYS, today).perDay).toBe(3000 * R);
  });

  it('сумма на сегодня считается на утро: перевод закрывает её, а не меняет', () => {
    const v = goalView(goal(), 41_000 * R, 1000 * R, ALL_DAYS, today);
    expect(v.perDay).toBe(3000 * R);
    expect(v.todayLeft).toBe(2000 * R);
    expect(goalView(goal(), 44_000 * R, 4000 * R, ALL_DAYS, today).todayLeft).toBe(0);
  });

  it('в выходной откладывать не нужно', () => {
    const v = goalView(goal(), 40_000 * R, 0, [1, 2, 3, 4, 5], '2026-11-08');
    expect(v.perDay).toBe(0);
    expect(v.status).not.toBe('done');
  });
});

describe('индикатор', () => {
  it('на графике — успеваем, ниже — отстаём на разницу', () => {
    expect(goalView(goal(), 60_000 * R, 0, ALL_DAYS, today).status).toBe('ontrack');
    const v = goalView(goal(), 50_000 * R, 0, ALL_DAYS, today);
    expect(v.status).toBe('ontrack');
    const late = goalView(goal(), 40_000 * R, 0, ALL_DAYS, today);
    expect(late.status).toBe('behind');
    expect(late.behind).toBe(666_667);
  });

  it('в первый день не отстаём', () => {
    expect(goalView(goal(), 20_000 * R, 0, ALL_DAYS, '2026-11-01').status).toBe('ontrack');
  });

  it('набранная сумма и прошедшая дата', () => {
    expect(goalView(goal(), 100_000 * R, 0, ALL_DAYS, today).status).toBe('done');
    expect(goalView(goal(), 100_000 * R, 0, ALL_DAYS, '2027-01-01').status).toBe('done');
    const late = goalView(goal(), 90_000 * R, 0, ALL_DAYS, '2026-12-01');
    expect(late.status).toBe('late');
    expect(late.perDay).toBe(0);
  });
});

describe('движение по счёту за сегодня', () => {
  it('считает переводы туда и обратно, доходы и расходы только этого счёта', () => {
    const list = [
      tx({ amount: 500 * R, toAccountId: 'jar' }),
      tx({ amount: 100 * R, accountId: 'jar', toAccountId: 'card' }),
      tx({ kind: 'income', amount: 50 * R, accountId: 'jar' }),
      tx({ kind: 'expense', amount: 20 * R, accountId: 'jar' }),
      tx({ kind: 'income', amount: 999 * R }),
      tx({ date: '2026-11-10', amount: 999 * R, toAccountId: 'jar' }),
    ];
    expect(movedToday(list, 'jar', today)).toBe(430 * R);
  });
});

describe('правка цели', () => {
  const fields = { name: 'Компьютер', amount: 100_000 * R, date: '2026-12-01', accountId: 'jar', paused: false };

  it('новая цель начинает график с того, что уже есть на счёте', () => {
    expect(applyGoal(null, fields, 5000 * R, today)).toMatchObject({ startDate: today, startSaved: 5000 * R });
  });

  it('смена названия график не трогает', () => {
    expect(applyGoal(goal(), { ...fields, name: 'Кроссовки' }, 50_000 * R, today)).toMatchObject({ name: 'Кроссовки', startDate: '2026-11-01', startSaved: 20_000 * R });
  });

  it('новая сумма, дата или счёт начинают график заново', () => {
    const restarted = { startDate: today, startSaved: 50_000 * R };
    expect(applyGoal(goal(), { ...fields, amount: 12_000 * R }, 50_000 * R, today)).toMatchObject(restarted);
    expect(applyGoal(goal(), { ...fields, date: '2027-01-01' }, 50_000 * R, today)).toMatchObject(restarted);
    expect(applyGoal(goal(), { ...fields, accountId: 'other' }, 50_000 * R, today)).toMatchObject(restarted);
  });

  it('пауза ставится без пересчёта, а её конец начинает график заново', () => {
    const paused = applyGoal(goal(), { ...fields, paused: true }, 50_000 * R, today);
    expect(paused).toMatchObject({ paused: true, startDate: '2026-11-01' });
    const back = applyGoal(goal({ paused: true }), fields, 50_000 * R, today);
    expect(back).not.toHaveProperty('paused');
    expect(back).toMatchObject({ startDate: today, startSaved: 50_000 * R });
  });
});
