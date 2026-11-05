/* Вкладка «Операции»: месяц по дням, правка по нажатию, удаление смахиванием. */
import { useMemo, useState } from 'react';
import { ConfirmDialog, Panel, cx, useSwipe } from '../../../core/ui';
import { formatDateDay } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { txRepo } from '../data/repo';
import { rub } from '../domain/money';
import { inMonth } from '../domain/stats';
import type { Account, Category, Tx } from '../domain/types';
import { MonthNav } from './MonthNav';
import s from './Finance.module.css';

function TxRow({ tx, title, sub, onOpen, onDelete }: { tx: Tx; title: string; sub: string; onOpen: () => void; onDelete: () => void }) {
  const swipe = useSwipe({ onLeft: onDelete });
  const sign = tx.kind === 'income' ? '+' : tx.kind === 'expense' ? '−' : '';
  return (
    <li className={s.row}>
      <div aria-hidden className={cx(s.swipeBg, swipe.pastThreshold && s.swipeReady)} style={{ opacity: swipe.dx < 0 ? 1 : 0 }}>
        Удалить
      </div>
      <button type="button" className={s.rowBtn} style={swipe.rowStyle} onClick={onOpen} {...swipe.bind}>
        <span className={s.grow}>
          {title}
          <br />
          <span className={s.dim}>{sub}</span>
        </span>
        <span className={tx.kind === 'income' ? s.good : undefined}>
          {sign}
          {rub(tx.amount)}
        </span>
      </button>
    </li>
  );
}

interface Props {
  month: LocalDate;
  onMonth: (m: LocalDate) => void;
  txs: Tx[];
  accounts: Account[];
  categories: Category[];
  onOpen: (t: Tx) => void;
}

export function TxList({ month, onMonth, txs, accounts, categories, onOpen }: Props) {
  const [deleting, setDeleting] = useState<Tx | null>(null);
  const days = useMemo(() => {
    const out = new Map<LocalDate, Tx[]>();
    const list = txs.filter((t) => inMonth(t, month)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    for (const t of list) out.set(t.date, [...(out.get(t.date) ?? []), t]);
    return [...out];
  }, [txs, month]);
  const accountName = (id: string | undefined) => accounts.find((a) => a.id === id)?.name ?? '?';
  const title = (t: Tx) => (t.kind === 'transfer' ? 'Перевод' : (categories.find((c) => c.id === t.categoryId)?.name ?? 'Без категории'));
  const sub = (t: Tx) => {
    const where = t.kind === 'transfer' ? `${accountName(t.accountId)} → ${accountName(t.toAccountId)}` : accountName(t.accountId);
    return t.note ? `${where} · ${t.note}` : where;
  };

  return (
    <>
      <MonthNav month={month} onChange={onMonth} />
      <div className={s.stack}>
        <Panel title="Операции" icon="coin" accent="var(--c-fin)">
          {days.length === 0 && <p className={s.hint}>В этом месяце записей нет.</p>}
          {days.map(([date, list]) => (
            <div key={date}>
              <div className={s.dayHead}>{formatDateDay(date)}</div>
              <ul className={s.list}>
                {list.map((t) => (
                  <TxRow key={t.id} tx={t} title={title(t)} sub={sub(t)} onOpen={() => onOpen(t)} onDelete={() => setDeleting(t)} />
                ))}
              </ul>
            </div>
          ))}
        </Panel>
      </div>
      <ConfirmDialog open={deleting !== null} title="Удалить операцию?" onClose={() => setDeleting(null)} onConfirm={() => deleting && void txRepo.remove(deleting.id)}>
        {deleting?.paymentId ? 'Срок платежа снова станет неоплаченным.' : 'Балансы и статистика пересчитаются.'}
      </ConfirmDialog>
    </>
  );
}
