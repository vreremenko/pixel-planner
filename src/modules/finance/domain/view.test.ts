import { describe, expect, it } from 'vitest';
import { buildPlanView } from './view';
import type { Account, Payment } from './types';

const base = { createdAt: 1, updatedAt: 1 };
const account: Account = { ...base, id: 'a', name: 'Карта', start: 29_350_00, inPlan: true };
const rent: Payment = { ...base, id: 'r', name: 'Квартира', amount: 18_000_00, categoryId: 'def:home', repeat: 'month', date: '2026-12-01', skipped: [] };

describe('сборка плана', () => {
  it('без настройки режим «каждый день»: у старых пользователей ничего не меняется', () => {
    expect(buildPlanView('2026-11-23', [account], [], [rent], {}).mode).toBe('daily');
  });

  it('«когда как» видит повторяющиеся платежи дальше месяца: хватит не «на три месяца», а до второй оплаты', () => {
    const v = buildPlanView('2026-11-23', [account], [], [rent], { incomeMode: 'irregular' });
    // после первой оплаты 1 декабря остаётся 11 350, второй платёж 1 января уже не покрыть
    expect(v.irregular.runway).toBe(39);
    expect(v.irregular.breaksOn?.name).toBe('Квартира');
    expect(v.irregular.breaksOn?.date).toBe('2027-01-01');
  });

  it('зарплатный режим считает только расписание выплат', () => {
    const v = buildPlanView('2026-11-23', [account], [], [rent], { incomeMode: 'salary', paydays: [{ id: 'p', name: 'Зарплата', amount: 60_000_00, repeat: 'month', date: '2026-12-10', skipped: [] }] });
    expect(v.salary.next?.date).toBe('2026-12-10');
    expect(v.salary.daysLeft).toBe(17);
    // до зарплаты уходит квартира: (29 350 − 18 000) / 17 = 667,6 → 667
    expect(v.salary.limit).toBe(667_00);
  });
});
