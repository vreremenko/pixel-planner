/* Карточка «Финансы» на сводке: сколько осталось заработать сегодня и ближайший платёж. */
import { useToday } from '../../../core/shell/useToday';
import { formatDateShort } from '../../../core/domain/dates';
import { Link } from 'react-router';
import { useAccounts, usePlan } from '../data/hooks';
import { rub, rubUp } from '../domain/money';
import { PlanHeadline } from './PlanHeadline';
import s from './Finance.module.css';

export function FinanceWidget() {
  const view = usePlan(useToday());
  const accounts = useAccounts();
  if (!view || !accounts) return null;
  if (!accounts.some((a) => !a.archived))
    return (
      <p style={{ margin: 0 }}>
        Укажите, сколько денег на карте, — и здесь появится, сколько можно тратить. <Link to="/finance">Начать</Link>
      </p>
    );
  const next = view.dues[0];
  return (
    <>
      <PlanHeadline view={view} />
      {next ? (
        <p className={s.hint}>
          Ближайший: {next.name}, {formatDateShort(next.date)}, {rub(next.amount)}
        </p>
      ) : (
        <p className={s.hint}>На счетах {rubUp(view.money)}</p>
      )}
    </>
  );
}
