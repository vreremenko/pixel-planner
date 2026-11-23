import { describe, expect, it } from 'vitest';
import { AccountData, type WireRecord } from './data';
import { TOOLS, ToolError, type ToolContext } from './tools';

let n = 0;
// 2026-11-16 — понедельник
const ctx: ToolContext = { now: 1_000, today: '2026-11-16', newId: () => `id${String(++n)}` };
const rec = (t: string, row: Record<string, unknown>): WireRecord => ({ t, id: String(row.id), u: 1, d: JSON.stringify({ createdAt: 1, updatedAt: 1, ...row }) });
/** Деньги в тексте идут с неразрывными пробелами — в проверках сравниваем с обычными. */
const run = (data: AccountData, name: string, input: Record<string, unknown> = {}) => {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(name);
  return tool.run(data, input, ctx).replace(/[\u00a0\u202f]/g, ' ');
};
const base = () => new AccountData([rec('fin_accounts', { id: 'a1', name: 'Карта', start: 3_000_000, inPlan: true })]);
const prefs = (data: AccountData) => JSON.parse(data.changes().find((c) => c.t === 'fin_prefs')?.d ?? '{}') as { incomeMode?: string; paydays?: { id: string; name: string; amount: number; date: string; skipped: string[] }[] };

describe('доходы по датам через помощника', () => {
  it('«зарплата 20-го по 60 тысяч»: добавляет выплату на ближайшее 20-е и включает режим «зарплата»', () => {
    const data = base();
    expect(run(data, 'add_payday', { name: 'Зарплата', amount: 60_000, day: 20 })).toContain('ближайшая');
    const p = prefs(data);
    expect(p.incomeMode).toBe('salary');
    expect(p.paydays?.[0]).toMatchObject({ name: 'Зарплата', amount: 6_000_000, date: '2026-11-20' });
    // 5-е уже прошло — ближайшее в декабре
    run(data, 'add_payday', { name: 'Аванс', amount: 25_000, day: 5 });
    expect(prefs(data).paydays?.[1]?.date).toBe('2026-12-05');
    expect(() => run(data, 'add_payday', { name: 'зарплата', amount: 1, day: 1 })).toThrow('уже есть');
    expect(() => run(data, 'add_payday', { name: 'Пенсия', amount: 1 })).toThrow(ToolError);
  });

  it('обзор финансов говорит словами режима: сколько можно тратить до зарплаты', () => {
    const data = base();
    run(data, 'add_payday', { name: 'Зарплата', amount: 60_000, day: 26 });
    // 30 000 ₽, 10 дней до 26-го → 3 000 в день
    expect(run(data, 'finance_overview')).toContain('Можно тратить сегодня 3 000');
    expect(run(data, 'list_paydays')).toContain('Зарплата: 60 000 ₽, каждый месяц; ближайшая');
  });

  it('«пришла зарплата»: доход закрывает выплату, ожидание исчезает, сумму можно поправить', () => {
    const data = base();
    run(data, 'set_income_mode', { mode: 'salary' });
    run(data, 'add_payday', { name: 'Зарплата', amount: 60_000, date: '2026-11-16' });
    expect(run(data, 'finance_overview')).toContain('Ждём выплату');
    expect(run(data, 'receive_payday', { amount: 58_500 })).toContain('58 500');
    const tx = JSON.parse(data.changes().find((c) => c.t === 'fin_tx')?.d ?? '{}') as Record<string, unknown>;
    expect(tx).toMatchObject({ kind: 'income', amount: 5_850_000, paydayId: prefs(data).paydays?.[0]?.id, dueDate: '2026-11-16' });
    expect(run(data, 'finance_overview')).not.toContain('Ждём выплату');
    // та же дата второй раз не открывается: следующая — через месяц
    expect(() => run(data, 'receive_payday', { name: 'Аванс' })).toThrow(ToolError);
  });

  it('«в этот раз не будет» пропускает дату, а не удаляет выплату', () => {
    const data = base();
    run(data, 'add_payday', { name: 'Аванс', amount: 20_000, date: '2026-11-18' });
    expect(run(data, 'skip_payday', { name: 'Аванс' })).toContain('Пропустил');
    expect(prefs(data).paydays?.[0]?.skipped).toEqual(['2026-11-18']);
    expect(run(data, 'list_paydays')).toContain('ближайшая 18 декабря'.slice(0, 9));
  });

  it('режим «когда как» в обзоре: на сколько дней хватит', () => {
    const data = base();
    run(data, 'set_income_mode', { mode: 'irregular' });
    expect(run(data, 'finance_overview')).toContain('Режим: когда как');
    expect(() => run(data, 'set_income_mode', { mode: 'вечный' })).toThrow(ToolError);
  });
});
