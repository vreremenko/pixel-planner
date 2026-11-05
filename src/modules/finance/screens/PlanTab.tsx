/* Вкладка «План»: цель на день, ближайшие платежи и счета. */
import { useState } from 'react';
import { Button, Panel } from '../../../core/ui';
import { formatDateShort } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import type { PlanView } from '../data/hooks';
import { rub, rubUp } from '../domain/money';
import type { Due } from '../domain/plan';
import type { Account, Payment } from '../domain/types';
import { AccountsModal } from './AccountsModal';
import { PayModal } from './PayModal';
import { PaymentEditor } from './PaymentEditor';
import { PlanHeadline } from './PlanHeadline';
import s from './Finance.module.css';

interface Props {
  today: LocalDate;
  view: PlanView;
  accounts: Account[];
  payments: Payment[];
}

export function PlanTab({ today, view, accounts, payments }: Props) {
  const { plan, dues, balance, money, living } = view;
  const [paying, setPaying] = useState<Due | null>(null);
  const [editing, setEditing] = useState<Payment | 'new' | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const live = accounts.filter((a) => !a.archived);
  const later = payments.filter((p) => !dues.some((d) => d.paymentId === p.id));

  return (
    <div className={s.stack}>
      <Panel title="План на сегодня" icon="target" accent="var(--c-fin)">
        <PlanHeadline plan={plan} hasDues={dues.length > 0} />
        {plan.shortNow > 0 && <p className={s.warn}>Срок уже наступил, не хватает {rub(plan.shortNow)}.</p>}
        {dues.length > 0 && (
          <div className={s.metrics}>
            <div className={s.metric}>
              <span className={s.dim}>С завтра в день</span>
              <b>{rubUp(plan.next)}</b>
            </div>
            <div className={s.metric}>
              <span className={s.dim}>На жизнь в день</span>
              <b>{rub(living)}</b>
            </div>
          </div>
        )}
      </Panel>
      <Panel title="Платежи" icon="calendar" accent="var(--c-fin)" actions={<Button small icon="plus" label="Добавить платёж" onClick={() => setEditing('new')} />}>
        {dues.length === 0 && later.length === 0 && <p className={s.hint}>Квартира, подписки, кредит: всё, что нужно оплатить к дате.</p>}
        <ul className={s.list}>
          {dues.map((d) => (
            <li key={`${d.paymentId}:${d.date}`} className={s.row}>
              <div className={s.line}>
                <button type="button" className={`${s.rowBtn} ${s.grow}`} onClick={() => setEditing(payments.find((p) => p.id === d.paymentId) ?? null)}>
                  <span className={s.grow}>
                    {d.name}
                    <br />
                    <span className={d.date < today ? s.bad : s.dim}>
                      {formatDateShort(d.date)}
                      {d.date < today ? ', просрочен' : ''}
                    </span>
                  </span>
                  <span>
                    {rub(d.amount)}
                    <br />
                    <span className={plan.covered.has(d) ? s.good : s.dim}>{plan.covered.has(d) ? 'хватает' : 'копим'}</span>
                  </span>
                </button>
                <Button small onClick={() => setPaying(d)}>
                  Оплатить
                </Button>
              </div>
            </li>
          ))}
          {later.map((p) => (
            <li key={p.id} className={s.row}>
              <button type="button" className={s.rowBtn} onClick={() => setEditing(p)}>
                <span className={s.grow}>
                  {p.name}
                  <br />
                  <span className={s.dim}>{p.repeat === 'once' ? 'Оплачен или срок прошёл' : 'Следующий срок позже месяца'}</span>
                </span>
                <span>{rub(p.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Счета" icon="coin" accent="var(--c-fin)" actions={<Button small onClick={() => setAccountsOpen(true)}>Изменить</Button>}>
        <ul className={s.list}>
          {live.map((a) => (
            <li key={a.id} className={s.row}>
              <div className={s.line}>
                <span className={s.grow}>
                  {a.name}
                  {!a.inPlan && <span className={s.dim}> · не в плане</span>}
                </span>
                <span>{rub(balance.get(a.id) ?? 0)}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className={s.hint}>В плане {rub(money)}</p>
      </Panel>
      {paying && <PayModal due={paying} today={today} accounts={live} payment={payments.find((p) => p.id === paying.paymentId)} onClose={() => setPaying(null)} />}
      {editing && <PaymentEditor payment={editing === 'new' ? null : editing} today={today} onClose={() => setEditing(null)} />}
      {accountsOpen && <AccountsModal accounts={accounts} balance={balance} onClose={() => setAccountsOpen(false)} />}
    </div>
  );
}
