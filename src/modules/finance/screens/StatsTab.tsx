/* Вкладка «Статистика»: итоги месяца, категории, последние полгода. */
import { useMemo } from 'react';
import { BarChart } from '../../../core/charts/BarChart';
import { ProgressBar } from '../../../core/charts/ProgressBar';
import { Panel } from '../../../core/ui';
import { MONTHS, parseLocalDate } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { rub } from '../domain/money';
import { byCategory, inMonth, lastMonths, monthLabel, totals, type CategoryShare } from '../domain/stats';
import type { Category, Tx } from '../domain/types';
import { MonthNav } from './MonthNav';
import s from './Finance.module.css';

function Shares({ list, categories, color }: { list: CategoryShare[]; categories: Category[]; color: string }) {
  if (list.length === 0) return <p className={s.hint}>В этом месяце записей нет.</p>;
  return list.map((c) => {
    const name = categories.find((x) => x.id === c.categoryId)?.name ?? 'Без категории';
    return (
      <div key={c.categoryId} className={s.barRow}>
        <div className={s.barHead}>
          <span className={s.grow}>{name}</span>
          <span className={s.amount}>
            {rub(c.sum)} <span className={s.dim}>{Math.round(c.share * 100)}%</span>
          </span>
        </div>
        <ProgressBar value={c.share} color={color} height={8} label={name} />
      </div>
    );
  });
}

export function StatsTab({ month, onMonth, txs, categories }: { month: LocalDate; onMonth: (m: LocalDate) => void; txs: Tx[]; categories: Category[] }) {
  const mine = useMemo(() => txs.filter((t) => inMonth(t, month)), [txs, month]);
  const sum = totals(mine);
  const left = sum.income - sum.expense;
  const history = useMemo(() => lastMonths(month, 6).map((m) => ({ m, ...totals(txs.filter((t) => inMonth(t, m))) })), [txs, month]);
  const bars = (key: 'income' | 'expense') =>
    history.map((h) => ({ label: (MONTHS[parseLocalDate(h.m).m - 1] ?? '').slice(0, 3), value: h[key] / 100, hint: `${monthLabel(h.m)}: ${rub(h[key])}` }));

  return (
    <>
      <MonthNav month={month} onChange={onMonth} />
      <div className={s.stack}>
        <Panel title="Итог месяца" icon="coin" accent="var(--c-fin)">
          <div className={s.metrics}>
            <div className={s.metric}>
              <span className={s.dim}>Доход</span>
              <b className={s.good}>{rub(sum.income)}</b>
            </div>
            <div className={s.metric}>
              <span className={s.dim}>Расход</span>
              <b>{rub(sum.expense)}</b>
            </div>
          </div>
          <p className={s.hint}>
            Разница: <span className={left < 0 ? s.bad : s.good}>{left < 0 ? '−' : '+'}{rub(Math.abs(left))}</span>
          </p>
        </Panel>
        <Panel title="Расходы" accent="var(--c-fin)">
          <Shares list={byCategory(mine, 'expense')} categories={categories} color="var(--c-warn)" />
        </Panel>
        <Panel title="Доходы" accent="var(--c-fin)">
          <Shares list={byCategory(mine, 'income')} categories={categories} color="var(--c-habit)" />
        </Panel>
        <Panel title="Полгода: расходы" accent="var(--c-fin)">
          <BarChart bars={bars('expense')} color="var(--c-warn)" title="Расходы за полгода" />
        </Panel>
        <Panel title="Полгода: доходы" accent="var(--c-fin)">
          <BarChart bars={bars('income')} color="var(--c-habit)" title="Доходы за полгода" />
        </Panel>
      </div>
    </>
  );
}
