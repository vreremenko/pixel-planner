/*
 * Действия помощника с доходами по датам: как человек получает деньги, зарплата и аванс, «пришла», «в этот раз не будет».
 * Расчёты — те же, что в приложении (domain/income), чтобы цифры совпадали.
 */
import { daysInMonth, formatDateDay, parseLocalDate } from '../core/domain/dates';
import type { LocalDate } from '../core/domain/types';
import { openPaydays, type Expected } from '../modules/finance/domain/income';
import { rub } from '../modules/finance/domain/money';
import type { Account, FinPrefs, IncomeMode, Payday, Repeat, Tx } from '../modules/finance/domain/types';
import type { AccountData } from './data';
import { ONLY_ON_REQUEST, ToolError, date, dateSchema, meta, norm, num, optText, pick, text, type Tool, type ToolContext } from './toolkit';

const MODES: Record<IncomeMode, string> = { salary: 'зарплата или аванс', daily: 'каждый день или смены', irregular: 'когда как' };

function prefsOf(data: AccountData, ctx: ToolContext): FinPrefs {
  return data.get<FinPrefs>('fin_prefs', 'prefs') ?? { ...meta(ctx), id: 'prefs' };
}

function savePrefs(data: AccountData, ctx: ToolContext, patch: Partial<FinPrefs>): FinPrefs {
  return data.put<FinPrefs>('fin_prefs', { ...prefsOf(data, ctx), ...patch, updatedAt: ctx.now });
}

/** Ближайшее число месяца `day` не раньше сегодняшнего (в коротком месяце — последний день). */
function nextDayOfMonth(day: number, today: LocalDate): LocalDate {
  const t = parseLocalDate(today);
  for (let add = 0; add < 3; add++) {
    const m0 = t.m - 1 + add;
    const year = t.y + Math.floor(m0 / 12);
    const month = (m0 % 12) + 1;
    const d = Math.min(day, daysInMonth(year, month));
    const iso = `${String(year)}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (iso >= today) return iso;
  }
  return today;
}

const REPEAT_WORD: Record<Repeat, string> = { once: 'разово', week: 'каждую неделю', month: 'каждый месяц', year: 'каждый год' };

const expectedList = (data: AccountData, ctx: ToolContext): Expected[] => {
  const prefs = prefsOf(data, ctx);
  return openPaydays(prefs.paydays ?? [], data.all<Tx>('fin_tx'), ctx.today, prefs.shiftWeekend !== false);
};

/** Какую выплату имеют в виду: по названию, а без названия — единственную ближайшую. */
function pickExpected(data: AccountData, ctx: ToolContext, name: string | undefined): Expected {
  const open = expectedList(data, ctx);
  if (open.length === 0) throw new ToolError('Выплат нет. Сначала добавьте зарплату или аванс (add_payday).');
  const names = [...new Map(open.map((e) => [e.paydayId, e])).values()];
  const chosen = name ? pick(names, name, (e) => e.name, 'выплату') : names.length === 1 ? names[0] : undefined;
  if (!chosen) throw new ToolError(`Какая выплата? Есть: ${names.map((e) => e.name).join(', ')}`);
  // Сначала неполученная, дата которой уже наступила, иначе ближайшая
  return open.filter((e) => e.paydayId === chosen.paydayId)[0] ?? chosen;
}

export const INCOME_TOOLS: readonly Tool[] = [
  {
    name: 'set_income_mode',
    title: 'Как получаю деньги',
    description:
      'Как пользователь получает деньги — от этого зависит главная цифра финансов. salary — зарплата или аванс по датам (показываем, сколько можно тратить в день до следующей выплаты), ' +
      'daily — каждый день или смены (сколько осталось заработать сегодня), irregular — когда как, фриланс (на сколько дней хватит денег). Данные не теряются, цифры пересчитываются.',
    inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['salary', 'daily', 'irregular'] } }, required: ['mode'], additionalProperties: false },
    readOnly: false,
    run: (data, input, ctx) => {
      const mode = input.mode;
      if (mode !== 'salary' && mode !== 'daily' && mode !== 'irregular') throw new ToolError('mode: salary, daily или irregular');
      savePrefs(data, ctx, { incomeMode: mode });
      const hint = mode === 'salary' && (prefsOf(data, ctx).paydays ?? []).length === 0 ? ' Выплат пока нет — добавьте зарплату (add_payday): когда и сколько приходит.' : '';
      return `Режим: ${MODES[mode]}.${hint}`;
    },
  },
  {
    name: 'list_paydays',
    title: 'Выплаты',
    description: 'Расписание зарплаты, аванса и других выплат: сколько, как часто и когда ближайшая; какие ждём, но ещё не пришли.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true,
    run: (data, _input, ctx) => {
      const prefs = prefsOf(data, ctx);
      const list = prefs.paydays ?? [];
      if (list.length === 0) return 'Выплат нет.';
      const open = expectedList(data, ctx);
      return [
        `Режим: ${MODES[prefs.incomeMode ?? 'daily']}.`,
        ...list.map((p) => {
          const next = open.find((e) => e.paydayId === p.id);
          const status = next ? (next.when < ctx.today ? `ждём с ${formatDateDay(next.when)}` : `ближайшая ${formatDateDay(next.when)}`) : 'ближайших нет';
          return `${p.name}: ${rub(p.amount)}, ${REPEAT_WORD[p.repeat]}; ${status}`;
        }),
      ].join('\n');
    },
  },
  {
    name: 'add_payday',
    title: 'Добавить выплату',
    description:
      'Добавить зарплату, аванс, пенсию или другую выплату по расписанию («зарплата 20-го по 60 тысяч», «аванс 5-го 25 000»). Передайте day — число месяца, либо date — точную дату первой выплаты. ' +
      'Две выплаты в месяц — два вызова (аванс и зарплата). Если режим ещё не выбран, включит «зарплату».',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Например: Зарплата, Аванс, Пенсия' },
        amount: { type: 'number', description: 'Сколько приходит, рублей (примерно)' },
        day: { type: 'number', description: 'Число месяца, 1–31; для повтора «каждый месяц»' },
        date: dateSchema,
        repeat: { type: 'string', enum: ['month', 'week', 'once'], description: 'По умолчанию month; week — каждую неделю (нужна date)' },
      },
      required: ['name', 'amount'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const name = text(input.name, 'name', 60);
      const amount = Math.round(num(input.amount, 'amount', 0.01, 100_000_000) * 100);
      const repeat: Repeat = input.repeat === 'week' ? 'week' : input.repeat === 'once' ? 'once' : 'month';
      let first: LocalDate;
      if (input.date !== undefined) first = date(input.date, ctx);
      else if (input.day !== undefined) first = nextDayOfMonth(Math.round(num(input.day, 'day', 1, 31)), ctx.today);
      else throw new ToolError('Нужно число месяца (day) или дата (date) выплаты');
      const prefs = prefsOf(data, ctx);
      const list = prefs.paydays ?? [];
      if (list.some((p) => norm(p.name) === norm(name))) throw new ToolError(`Выплата «${name}» уже есть. Чтобы поменять, удалите её и добавьте заново.`);
      const payday: Payday = { id: ctx.newId(), name, amount, repeat, date: first, skipped: [] };
      const switched = prefs.incomeMode === undefined;
      savePrefs(data, ctx, { paydays: [...list, payday], ...(switched ? { incomeMode: 'salary' as const } : {}) });
      const note = switched ? ' Включил режим «зарплата».' : prefs.incomeMode !== 'salary' ? ` Режим сейчас «${MODES[prefs.incomeMode ?? 'daily']}», выплаты считаются в режиме «зарплата» (set_income_mode).` : '';
      return `Добавил выплату «${name}»: ${rub(amount)}, ${REPEAT_WORD[repeat]}, ближайшая ${formatDateDay(first)}.${note}`;
    },
  },
  {
    name: 'receive_payday',
    title: 'Пришла зарплата',
    description:
      'Отметить, что выплата пришла («пришла зарплата», «упал аванс 25 тысяч»): записывает доход на счёт и закрывает ожидаемую выплату, расчёт сразу обновляется. ' +
      'Сумму передавайте, если она отличается от ожидаемой. Это вместо add_transaction для зарплаты, когда выплаты настроены.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Какая выплата; если она одна — можно не называть' },
        amount: { type: 'number', description: 'Сколько пришло, рублей; без него — ожидаемая сумма' },
        account: { type: 'string', description: 'Название счёта, необязательно' },
        date: dateSchema,
      },
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const e = pickExpected(data, ctx, optText(input.name, 60));
      const amount = input.amount === undefined ? e.amount : Math.round(num(input.amount, 'amount', 0.01, 100_000_000) * 100);
      const accounts = data.all<Account>('fin_accounts').filter((a) => !a.archived);
      if (accounts.length === 0) throw new ToolError('В финансах нет ни одного счёта. Добавьте счёт в приложении.');
      const accountName = optText(input.account);
      const account = accountName ? pick(accounts, accountName, (a) => a.name, 'счёт') : (accounts.find((a) => a.inPlan) ?? accounts[0]);
      if (!account) throw new ToolError('Счёт не найден');
      const d = date(input.date, ctx);
      data.put('fin_tx', { ...meta(ctx), date: d, kind: 'income', amount, accountId: account.id, categoryId: 'def:work', note: e.name, paydayId: e.paydayId, dueDate: e.date });
      return `Записал: «${e.name}» ${rub(amount)} на счёт «${account.name}».`;
    },
  },
  {
    name: 'skip_payday',
    title: 'Выплаты в этот раз не будет',
    description: 'Выплаты в этот раз не будет («аванс задержали на месяц», «премии нет»): ближайшая дата пропускается, расчёт идёт к следующей.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: false },
    readOnly: false,
    run: (data, input, ctx) => {
      const e = pickExpected(data, ctx, optText(input.name, 60));
      const prefs = prefsOf(data, ctx);
      savePrefs(data, ctx, { paydays: (prefs.paydays ?? []).map((p) => (p.id === e.paydayId ? { ...p, skipped: [...p.skipped, e.date] } : p)) });
      return `Пропустил «${e.name}» от ${formatDateDay(e.date)}.`;
    },
  },
  {
    name: 'delete_payday',
    title: 'Удалить выплату',
    description: 'Убрать выплату из расписания совсем. Уже записанные доходы остаются.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const prefs = prefsOf(data, ctx);
      const p = pick(prefs.paydays ?? [], text(input.name, 'name', 60), (x) => x.name, 'выплату');
      savePrefs(data, ctx, { paydays: (prefs.paydays ?? []).filter((x) => x.id !== p.id) });
      return `Удалил выплату «${p.name}».`;
    },
  },
];
