/* Карточка «Финансы» на сводке: сколько осталось заработать сегодня и ближайший платёж. */
import { useToday } from '../../../core/shell/useToday';
import { formatDateShort } from '../../../core/domain/dates';
import { usePlan } from '../data/hooks';
import { rub, rubUp } from '../domain/money';
import { PlanHeadline } from './PlanHeadline';
import s from './Finance.module.css';

export function FinanceWidget() {
  const view = usePlan(useToday());
  if (!view) return null;
  const next = view.dues[0];
  return (
    <>
      <PlanHeadline plan={view.plan} hasDues={view.dues.length > 0} />
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
