/* Вкладка «План»: цель на день, ближайшие платежи и счета. */
import { useState } from 'react';
import { Button, Panel } from '../../../core/ui';
import { formatDateShort } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import type { PlanView } from '../data/hooks';
import { rub, rubUp } from '../domain/money';
import { coveredByMoney, type Expected } from '../domain/income';
import type { Due } from '../domain/plan';
import { savedInMonth } from '../domain/save';
import type { Account, Payday, Payment, Tx } from '../domain/types';
import { AccountsModal } from './AccountsModal';
import { GoalsPanel } from './GoalsPanel';
import { PayModal } from './PayModal';
import { PaydayEditor } from './PaydayEditor';
import { ReceiveModal } from './ReceiveModal';
import { PaymentEditor } from './PaymentEditor';
import { PlanHeadline } from './PlanHeadline';
import s from './Finance.module.css';

interface Props {
  today: LocalDate;
  view: PlanView;
  accounts: Account[];
  payments: Payment[];
  txs: Tx[];
  paydays: Payday[];
}

export function PlanTab({ today, view, accounts, payments, txs, paydays }: Props) {
  const { plan, dues, balance, money, living } = view;
  const [paying, setPaying] = useState<Due | null>(null);
  const [editing, setEditing] = useState<Payment | 'new' | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [receiving, setReceiving] = useState<Expected | null>(null);
  const [editingPayday, setEditingPayday] = useState<Payday | 'new' | null>(null);
  // Подпись «хватает» в дневном режиме считает темп заработка, в остальных — деньги на счетах
  const covered = view.mode === 'daily' ? plan.covered : coveredByMoney(dues, money);
  // Ближайшая неполученная выплата по каждому расписанию
  const nextPaydays = paydays.flatMap((p) => view.expected.find((e) => e.paydayId === p.id) ?? []).sort((a, b) => a.when.localeCompare(b.when));
  const live = accounts.filter((a) => !a.archived);
  const later = payments.filter((p) => !dues.some((d) => d.paymentId === p.id));

  return (
    <div className={s.stack}>
      <Panel title="План на сегодня" icon="target" accent="var(--c-fin)">
        <PlanHeadline view={view} />
        {view.mode === 'daily' && plan.shortNow > 0 && <p className={s.warn}>Срок уже наступил, не хватает {rub(plan.shortNow)}.</p>}
        {view.mode === 'daily' && dues.length > 0 && (
          <div className={s.metrics}>
            <div className={s.metric}>
              <span className={s.dim}>С завтра в день</span>
              <b>{rubUp(plan.next)}</b>
            </div>
          </div>
        )}
        {view.mode === 'salary' && view.salary.tomorrow !== null && view.salary.state === 'ok' && (
          <div className={s.metrics}>
            <div className={s.metric}>
              <span className={s.dim}>Завтра можно</span>
              <b>{rub(Math.floor(view.salary.tomorrow / 100) * 100)}</b>
            </div>
          </div>
        )}
        {view.mode !== 'irregular' && (dues.length > 0 || view.mode === 'salary') && (
          <p className={s.hint}>{living > 0 ? `Обычно вы тратите около ${rubUp(living)} в день.` : 'Сколько вы обычно тратите, станет ясно через неделю записей.'}</p>
        )}
      </Panel>
      {view.mode === 'salary' && (
        <Panel title="Доходы" icon="coin" accent="var(--c-fin)" actions={<Button small icon="plus" label="Добавить выплату" onClick={() => setEditingPayday('new')} />}>
          {nextPaydays.length === 0 && <p className={s.hint}>Зарплата, аванс, пенсия: когда и сколько приходит.</p>}
          <ul className={s.list}>
            {nextPaydays.map((e) => (
              <li key={`${e.paydayId}:${e.date}`} className={s.row}>
                <div className={s.line}>
                  <button type="button" className={s.rowBtn} onClick={() => setEditingPayday(paydays.find((p) => p.id === e.paydayId) ?? null)}>
                    <span className={s.grow}>
                      {e.name}
                      <br />
                      <span className={e.when <= today ? s.warn : s.dim}>
                        {formatDateShort(e.when)}
                        {e.when < today ? ', ждём' : e.when === today ? ', сегодня' : ''}
                      </span>
                    </span>
                    <span className={s.amount}>{rub(e.amount)}</span>
                  </button>
                  <Button small onClick={() => setReceiving(e)}>
                    Пришла
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Платежи" icon="calendar" accent="var(--c-fin)" actions={<Button small icon="plus" label="Добавить платёж" onClick={() => setEditing('new')} />}>
        {dues.length === 0 && later.length === 0 && <p className={s.hint}>Квартира, подписки, кредит: всё, что нужно оплатить к дате.</p>}
        <ul className={s.list}>
          {dues.map((d) => (
            <li key={`${d.paymentId}:${d.date}`} className={s.row}>
              <div className={s.line}>
                <button type="button" className={s.rowBtn} onClick={() => setEditing(payments.find((p) => p.id === d.paymentId) ?? null)}>
                  <span className={s.grow}>
                    {d.name}
                    <br />
                    <span className={d.date < today ? s.bad : s.dim}>
                      {formatDateShort(d.date)}
                      {d.date < today ? ', просрочен' : ''}
                    </span>
                  </span>
                  <span className={s.amount}>
                    {rub(d.amount)}
                    <br />
                    <span className={covered.has(d) ? s.good : s.bad}>{covered.has(d) ? 'хватает' : 'не хватает'}</span>
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
                  <span className={s.dim}>{p.repeat !== 'once' ? 'Следующий срок позже месяца' : p.date > today ? `Срок ${formatDateShort(p.date)}: в плане появится за месяц до срока` : 'Оплачен или срок прошёл'}</span>
                </span>
                <span className={s.amount}>{rub(p.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <GoalsPanel today={today} accounts={accounts} balance={balance} work={view.work} txs={txs} />
      <Panel title="Счета" icon="coin" accent="var(--c-fin)" actions={<Button small onClick={() => setAccountsOpen(true)}>Изменить</Button>}>
        <ul className={s.list}>
          {live.map((a) => (
            <li key={a.id} className={s.row}>
              <div className={s.line}>
                <span className={s.grow}>
                  {a.name}
                  {!a.inPlan && <span className={s.dim}> · не в плане</span>}
                  {!a.inPlan && savedInMonth(txs, a.id, today) > 0 && (
                    <>
                      <br />
                      <span className={s.good}>отложено в этом месяце: {rub(savedInMonth(txs, a.id, today))}</span>
                    </>
                  )}
                </span>
                <span className={s.amount}>{rub(balance.get(a.id) ?? 0)}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className={s.hint}>В плане {rub(money)}</p>
      </Panel>
      {paying && <PayModal due={paying} today={today} accounts={live} payment={payments.find((p) => p.id === paying.paymentId)} onClose={() => setPaying(null)} />}
      {receiving && <ReceiveModal expected={receiving} today={today} accounts={live} onClose={() => setReceiving(null)} />}
      {editingPayday && <PaydayEditor payday={editingPayday === 'new' ? null : editingPayday} today={today} onClose={() => setEditingPayday(null)} />}
      {editing && <PaymentEditor payment={editing === 'new' ? null : editing} today={today} onClose={() => setEditing(null)} />}
      {accountsOpen && <AccountsModal accounts={accounts} balance={balance} onClose={() => setAccountsOpen(false)} />}
    </div>
  );
}
