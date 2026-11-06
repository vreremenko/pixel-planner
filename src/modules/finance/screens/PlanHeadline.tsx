/* Главное число плана: сколько осталось заработать сегодня. */
import { ProgressBar } from '../../../core/charts/ProgressBar';
import type { DayPlan } from '../domain/plan';
import { rub, rubUp } from '../domain/money';
import s from './Finance.module.css';

export function PlanHeadline({ plan, hasDues }: { plan: DayPlan; hasDues: boolean }) {
  if (!hasDues) return <p className={s.hint}>Добавьте платежи с датами, и здесь появится цель на день.</p>;
  if (plan.dayOff) {
    return (
      <>
        <div className={s.dim}>Сегодня выходной</div>
        <div className={s.big}>{plan.next > 0 ? rubUp(plan.next) : 'Всё покрыто'}</div>
        {plan.next > 0 && <div className={s.dim}>в рабочий день, начиная со следующего</div>}
      </>
    );
  }
  if (plan.target <= 0) {
    return (
      <>
        <div className={s.big}>Всё покрыто</div>
        <div className={s.dim}>Свободно {rub(plan.free)} с учётом платежей и расходов на жизнь</div>
      </>
    );
  }
  return (
    <>
      <div className={s.dim}>{plan.left > 0 ? 'Сегодня осталось заработать' : 'Цель на сегодня выполнена'}</div>
      <div className={s.big}>{rubUp(plan.left)}</div>
      <ProgressBar value={plan.earned / plan.target} color="var(--c-fin)" label="Заработано сегодня" />
      <div className={`${s.dim} ${s.progressNote}`}>
        Заработано {rub(plan.earned)} из {rubUp(plan.target)}
      </div>
    </>
  );
}
