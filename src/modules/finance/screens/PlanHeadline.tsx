/* Главное число плана — под режим дохода: сколько можно тратить, сколько осталось заработать или на сколько дней хватит. */
import { ProgressBar } from '../../../core/charts/ProgressBar';
import { formatDateShort } from '../../../core/domain/dates';
import type { DayPlan } from '../domain/plan';
import type { IrregularPlan, SalaryPlan } from '../domain/income';
import { daysText, rub, rubUp } from '../domain/money';
import type { PlanView } from '../domain/view';
import s from './Finance.module.css';

function DailyHeadline({ plan, hasDues }: { plan: DayPlan; hasDues: boolean }) {
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

/** Деньги вниз до рубля: обещать лишнего нельзя. */
const rubDown = (k: number) => rub(Math.floor(k / 100) * 100);

function SalaryHeadline({ plan }: { plan: SalaryPlan }) {
  const waiting = plan.waiting[0];
  const wait = waiting && (
    <p className={s.warn}>
      Ждём «{waiting.name}» от {formatDateShort(waiting.date)}: пока не пришла — не считаем.
    </p>
  );
  if (plan.state === 'noPayday') {
    return (
      <>
        {wait}
        <p className={s.hint}>Укажите, когда приходит зарплата или аванс, — и здесь появится, сколько можно тратить в день.</p>
      </>
    );
  }
  const head =
    plan.state === 'short' ? (
      <>
        <div className={s.dim}>До зарплаты денег не хватает</div>
        <div className={s.big}>{rub(-plan.free)}</div>
        {plan.short && (
          <div className={s.dim}>
            К {formatDateShort(plan.short.due.date)} на «{plan.short.due.name}» не хватает {rub(plan.short.need)}
          </div>
        )}
      </>
    ) : (
      <>
        <div className={s.dim}>{plan.left >= 0 ? 'Можно тратить сегодня' : 'Сегодня потрачено больше лимита'}</div>
        <div className={s.big}>{plan.left >= 0 ? rubDown(plan.left) : rub(-plan.left)}</div>
        {plan.limit > 0 && <ProgressBar value={Math.min(1, plan.spent / plan.limit)} color={plan.left >= 0 ? 'var(--c-fin)' : 'var(--c-warn)'} label="Потрачено сегодня" />}
        <div className={`${s.dim} ${s.progressNote}`}>
          Потрачено {rub(plan.spent)} из {rubDown(plan.limit)}
          {plan.left < 0 && plan.tomorrow !== null ? `. Завтра можно ${rubDown(plan.tomorrow)}` : ''}
        </div>
      </>
    );
  return (
    <>
      {wait}
      {head}
      {plan.next && (
        <div className={`${s.dim} ${s.progressNote}`}>
          «{plan.next.name}» {formatDateShort(plan.next.when)} · до неё {daysText(plan.daysLeft)}
          {plan.state === 'ok' ? `, свободно ${rubDown(plan.free)}` : ''}
        </div>
      )}
      {plan.afterSum > 0 && (
        <p className={s.hint}>
          После зарплаты уйдёт {rub(plan.afterSum)}: {plan.after.map((d) => d.name).join(', ')}.
        </p>
      )}
    </>
  );
}

function IrregularHeadline({ plan, hasData }: { plan: IrregularPlan; hasData: boolean }) {
  if (!hasData) return <p className={s.hint}>Записывайте траты и добавьте платежи — здесь появится, на сколько дней хватит денег.</p>;
  return (
    <>
      <div className={s.dim}>Денег хватит при обычных тратах</div>
      <div className={s.big}>{plan.runway === null ? 'больше 3 месяцев' : plan.runway === 0 ? 'меньше суток' : daysText(plan.runway)}</div>
      {plan.breaksOn && (
        <div className={s.dim}>
          Не хватит на «{plan.breaksOn.name}», {formatDateShort(plan.breaksOn.date)}
        </div>
      )}
      <p className={s.hint}>{plan.needMonth > 0 ? `Чтобы закрыть ближайший месяц, нужно получить ${rubUp(plan.needMonth)}.` : 'На ближайший месяц денег хватает.'}</p>
    </>
  );
}

export function PlanHeadline({ view }: { view: PlanView }) {
  if (view.mode === 'salary') return <SalaryHeadline plan={view.salary} />;
  if (view.mode === 'irregular') return <IrregularHeadline plan={view.irregular} hasData={view.living > 0 || view.dues.length > 0} />;
  return <DailyHeadline plan={view.plan} hasDues={view.dues.length > 0} />;
}
