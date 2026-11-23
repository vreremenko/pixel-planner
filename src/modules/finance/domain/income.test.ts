import { describe, expect, it } from 'vitest';
import { effectiveDate, irregularPlan, openPaydays, salaryPlan, type Expected } from './income';
import type { Due } from './plan';
import type { Payday, Tx } from './types';

const R = 100; // рубль в копейках
const due = (name: string, date: string, rub: number): Due => ({ paymentId: name, name, date, amount: rub * R, categoryId: 'def:home' });
const payday = (o: Partial<Payday> & { date: string; amount: number }): Payday => ({ id: 'p1', name: 'Зарплата', repeat: 'month', skipped: [], ...o });
const exp = (date: string, when = date, rub = 40_000): Expected => ({ paydayId: 'p1', name: 'Зарплата', amount: rub * R, date, when });
const expense = (rub: number, o: Partial<Tx> = {}): Tx => ({ id: 't', createdAt: 1, updatedAt: 1, date: '2026-06-10', kind: 'expense', amount: rub * R, accountId: 'a', ...o });

describe('даты выплат', () => {
  // 2026-06-06 — суббота, 2026-06-07 — воскресенье, 2026-06-05 — пятница
  it('выплата на выходной ждётся в пятницу, если не отключено', () => {
    expect(effectiveDate('2026-06-06', true)).toBe('2026-06-05');
    expect(effectiveDate('2026-06-07', true)).toBe('2026-06-05');
    expect(effectiveDate('2026-06-05', true)).toBe('2026-06-05');
    expect(effectiveDate('2026-06-06', false)).toBe('2026-06-06');
  });

  it('открытые выплаты: полученные и пропущенные не считаются, порядок — по дате ожидания', () => {
    const paydays = [payday({ id: 'a', name: 'Аванс', date: '2026-06-05', amount: 20_000 * R }), payday({ id: 'z', name: 'Зарплата', date: '2026-06-20', amount: 40_000 * R, skipped: ['2026-07-20'] })];
    const got = [expense(1, { kind: 'income', paydayId: 'z', dueDate: '2026-06-20' })];
    const list = openPaydays(paydays, got, '2026-06-10', true);
    // 5 июня уже прошло и не получено — «ждём»; 20 июня получена; 20 июля пропущена; 5 июля (воскресенье) — в пятницу 3 июля
    expect(list.map((e) => `${e.name} ${e.date} → ${e.when}`)).toEqual(['Аванс 2026-06-05 → 2026-06-05', 'Аванс 2026-07-05 → 2026-07-03', 'Аванс 2026-08-05 → 2026-08-05']);
  });

  it('31-е в коротком месяце — последний день месяца, и дальше 31-го не сползает', () => {
    const list = openPaydays([payday({ date: '2026-01-31', amount: 1000 * R })], [], '2026-02-10', false);
    // 31 января уже прошло и не получено — «ждём»; дальше 28 февраля и 31 марта, а не 28-е навсегда
    expect(list.map((e) => e.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('зарплата: сколько можно тратить сегодня', () => {
  const base = { today: '2026-06-10', todayTx: [] as Tx[] };

  it('деньги минус платежи до зарплаты, поделённые на дни до неё', () => {
    // 10 дней до 20 июня; 30 000 − 10 000 (аренда 15-го) = 20 000 → 2 000 в день
    const p = salaryPlan({ ...base, money: 30_000 * R, dues: [due('Аренда', '2026-06-15', 10_000)], expected: [exp('2026-06-20')] });
    expect(p).toMatchObject({ state: 'ok', daysLeft: 10, free: 20_000 * R, limit: 2_000 * R, left: 2_000 * R, tomorrow: Math.floor((20_000 * R) / 9 / R) * R });
  });

  it('платёж в день выплаты — уже после неё, до выплаты не вычитается, но показывается предупреждением', () => {
    const p = salaryPlan({ ...base, money: 10_000 * R, dues: [due('Квартира', '2026-06-20', 35_000), due('Интернет', '2026-06-24', 600), due('Далеко', '2026-07-30', 5_000)], expected: [exp('2026-06-20')] });
    expect(p.free).toBe(10_000 * R);
    expect(p.limit).toBe(1_000 * R);
    expect(p.after.map((d) => d.name)).toEqual(['Квартира', 'Интернет']);
    expect(p.afterSum).toBe(35_600 * R);
  });

  it('лимит считается от денег на начало дня: трата сегодня уменьшает «осталось», а не лимит', () => {
    const money = 20_000 * R;
    const morning = salaryPlan({ ...base, money, dues: [], expected: [exp('2026-06-20')] });
    const evening = salaryPlan({ ...base, money: money - 600 * R, dues: [], expected: [exp('2026-06-20')], todayTx: [expense(600)] });
    expect(evening.limit).toBe(morning.limit);
    expect(evening.spent).toBe(600 * R);
    expect(evening.left).toBe(morning.limit - 600 * R);
    // завтра лимит чуть меньше: остаток поделён на 9 дней, а не 10 (экономия и перерасход переходят на завтра)
    expect(evening.tomorrow).toBe(Math.floor(((20_000 - 600) * R) / 9 / R) * R);
  });

  it('перерасход виден отрицательным остатком, а завтра лимит ниже', () => {
    const p = salaryPlan({ ...base, money: 18_000 * R, dues: [], expected: [exp('2026-06-20')], todayTx: [expense(3_000)] });
    expect(p.limit).toBe(2_100 * R); // (18 000 + 3 000) / 10
    expect(p.left).toBe(-900 * R);
    expect(p.tomorrow).toBeLessThan(p.limit);
  });

  it('оплаченный сегодня платёж не меняет лимит и не считается тратой', () => {
    const paid = expense(10_000, { paymentId: 'Аренда', dueDate: '2026-06-10' });
    const before = salaryPlan({ ...base, money: 30_000 * R, dues: [due('Аренда', '2026-06-10', 10_000)], expected: [exp('2026-06-20')] });
    const after = salaryPlan({ ...base, money: 20_000 * R, dues: [], expected: [exp('2026-06-20')], todayTx: [paid] });
    expect(after.limit).toBe(before.limit);
    expect(after.spent).toBe(0);
  });

  it('не хватает на платежи до зарплаты: лимит ноль, видно, на какой срок и сколько', () => {
    const p = salaryPlan({ ...base, money: 5_000 * R, dues: [due('Кредит', '2026-06-12', 3_000), due('Аренда', '2026-06-15', 10_000)], expected: [exp('2026-06-20')] });
    expect(p.state).toBe('short');
    expect(p.limit).toBe(0);
    expect(p.short?.due.name).toBe('Аренда');
    expect(p.short?.need).toBe(8_000 * R);
  });

  it('зарплата завтра: до неё один день, «со следующего дня» нет', () => {
    const p = salaryPlan({ ...base, money: 900 * R, dues: [], expected: [exp('2026-06-11')] });
    expect(p.daysLeft).toBe(1);
    expect(p.limit).toBe(900 * R);
    expect(p.tomorrow).toBeNull();
  });

  it('выплата задерживается: дата наступила, денег нет — в расчёт не входит, считаем до следующей', () => {
    const p = salaryPlan({ ...base, money: 6_000 * R, dues: [], expected: [exp('2026-06-10'), exp('2026-07-10')] });
    expect(p.waiting.map((e) => e.date)).toEqual(['2026-06-10']);
    expect(p.next?.date).toBe('2026-07-10');
    expect(p.daysLeft).toBe(30);
    expect(p.limit).toBe(200 * R);
  });

  it('выплат нет: без выдуманных лимитов', () => {
    const p = salaryPlan({ ...base, money: 6_000 * R, dues: [], expected: [] });
    expect(p.state).toBe('noPayday');
    expect(p.limit).toBe(0);
  });

  it('лимит округляется вниз до рубля, чтобы не обещать лишнего', () => {
    const p = salaryPlan({ ...base, money: 1_000 * R + 99, dues: [], expected: [exp('2026-06-13')] });
    expect(p.limit).toBe(333 * R);
  });

  it('просроченный платёж вычитается из свободных денег', () => {
    const p = salaryPlan({ ...base, money: 10_000 * R, dues: [due('Штраф', '2026-06-01', 2_000)], expected: [exp('2026-06-20')] });
    expect(p.free).toBe(8_000 * R);
  });
});

describe('«когда как»: на сколько дней хватит', () => {
  const base = { today: '2026-06-10', todayTx: [] as Tx[] };

  it('считает дни до первого дня, когда денег не хватит, с учётом платежей', () => {
    // 10 000, трат 500 в день, аренда 9 000 на 5-й день: к концу 4-го дня остаётся 7 500, на 5-й уже минус
    const p = irregularPlan({ ...base, money: 10_000 * R, living: 500 * R, dues: [due('Аренда', '2026-06-15', 9_000)] });
    expect(p.runway).toBe(5);
    expect(p.breaksOn?.name).toBe('Аренда');
  });

  it('без платежей и трат хватает «больше трёх месяцев»', () => {
    expect(irregularPlan({ ...base, money: 10_000 * R, living: 0, dues: [] }).runway).toBeNull();
  });

  it('сколько нужно получить за месяц: платежи и обычные траты минус деньги', () => {
    const p = irregularPlan({ ...base, money: 20_000 * R, living: 1_000 * R, dues: [due('Аренда', '2026-06-15', 30_000), due('Позже', '2026-08-01', 99_999)] });
    expect(p.dues30).toBe(30_000 * R);
    expect(p.needMonth).toBe(40_000 * R); // 30 000 + 30 × 1 000 − 20 000
  });

  it('денег больше, чем нужно: получать ничего не надо', () => {
    expect(irregularPlan({ ...base, money: 500_000 * R, living: 1_000 * R, dues: [] }).needMonth).toBe(0);
  });

  it('просроченный платёж ломает «сегодня»: хватит на 0 дней', () => {
    expect(irregularPlan({ ...base, money: 1_000 * R, living: 0, dues: [due('Долг', '2026-06-01', 5_000)] }).runway).toBe(0);
  });
});
