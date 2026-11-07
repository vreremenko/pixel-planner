/* Цели на вкладке «План»: отдельно от платежей, блок можно свернуть. */
import { useState } from 'react';
import { ProgressBar } from '../../../core/charts/ProgressBar';
import { formatDateShort } from '../../../core/domain/dates';
import type { LocalDate, Weekday } from '../../../core/domain/types';
import { collapseKey, useCollapsed } from '../../../core/stores/collapsed';
import { Button, Panel, cx } from '../../../core/ui';
import { useGoals } from '../data/hooks';
import { goalRepo } from '../data/repo';
import { applyGoal, goalView, movedToday, type GoalView } from '../domain/goals';
import { rub, rubUp } from '../domain/money';
import type { Account, Goal, Kopecks, Tx } from '../domain/types';
import { GoalEditor } from './GoalEditor';
import s from './Finance.module.css';

const STATUS_COLOR: Record<GoalView['status'], string> = { done: 'var(--c-habit)', ontrack: 'var(--c-habit)', behind: 'var(--c-warn)', late: 'var(--c-warn)' };

function statusText(v: GoalView, goal: Goal): string {
  if (v.status === 'done') return 'Накоплено';
  if (v.status === 'late') return `Срок прошёл, не хватает ${rub(goal.amount - v.saved)}`;
  return v.status === 'behind' ? `Отстаём на ${rub(v.behind)}` : 'Успеваем';
}

function todayText(v: GoalView): string | null {
  if (v.status === 'done' || v.status === 'late') return null;
  if (v.perDay === 0) return 'Сегодня выходной';
  return v.todayLeft > 0 ? `Сегодня отложить ${rubUp(v.todayLeft)}` : 'На сегодня отложено';
}

interface Props {
  today: LocalDate;
  accounts: Account[];
  balance: ReadonlyMap<string, Kopecks>;
  work: readonly Weekday[];
  txs: Tx[];
}

export function GoalsPanel({ today, accounts, balance, work, txs }: Props) {
  const goals = useGoals();
  const collapsed = useCollapsed((st) => st.collapsed[collapseKey.finGoals] === true);
  const toggle = useCollapsed((st) => st.toggle);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  if (!goals) return null;
  const saved = (g: Goal) => balance.get(g.accountId) ?? 0;
  const active = goals.filter((g) => !g.paused);
  const paused = goals.filter((g) => g.paused);

  return (
    <Panel
      title="Цели"
      icon="flag"
      accent="var(--c-fin)"
      actions={
        <>
          <Button small icon="plus" label="Добавить цель" onClick={() => setEditing('new')} />
          <Button small icon={collapsed ? 'down' : 'up'} label={collapsed ? 'Развернуть цели' : 'Свернуть цели'} aria-expanded={!collapsed} onClick={() => toggle(collapseKey.finGoals)} />
        </>
      }
    >
      {!collapsed && (
        <>
          {goals.length === 0 && <p className={s.hint}>Компьютер, отпуск, подушка: на что хотите накопить к дате.</p>}
          <ul className={s.list}>
            {active.map((g) => {
              const v = goalView(g, saved(g), movedToday(txs, g.accountId, today), work, today);
              const line = todayText(v);
              return (
                <li key={g.id} className={s.row}>
                  <button type="button" className={cx(s.rowBtn, s.goal)} onClick={() => setEditing(g)}>
                    <span className={s.goalHead}>
                      <span className={s.grow}>{g.name}</span>
                      <span className={s.dim}>до {formatDateShort(g.date)}</span>
                    </span>
                    <span className={s.dim}>
                      {rub(v.saved)} из {rub(g.amount)}
                    </span>
                    <ProgressBar value={v.saved / g.amount} color={STATUS_COLOR[v.status]} label={`Накоплено: ${g.name}`} />
                    {line && <span>{line}</span>}
                    <span className={s.goalStatus} style={{ color: STATUS_COLOR[v.status] }}>
                      {statusText(v, g)}
                    </span>
                  </button>
                </li>
              );
            })}
            {paused.map((g) => (
              <li key={g.id} className={s.row}>
                <div className={s.line}>
                  <button type="button" className={s.rowBtn} onClick={() => setEditing(g)}>
                    <span className={cx(s.grow, s.dim)}>
                      На паузе: {g.name}, {rub(saved(g))} из {rub(g.amount)}
                    </span>
                  </button>
                  <Button small onClick={() => void goalRepo.save(applyGoal(g, { ...g, paused: false }, saved(g), today))}>
                    Включить
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {editing && <GoalEditor goal={editing === 'new' ? null : editing} goals={goals} accounts={accounts} balance={balance} work={work} today={today} onClose={() => setEditing(null)} />}
    </Panel>
  );
}
