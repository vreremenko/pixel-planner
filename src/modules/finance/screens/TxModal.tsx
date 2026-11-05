/* Запись и правка операции: сумма, категория плиткой; дата и счёт стоят сами. */
import { useMemo, useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, SelectInput, TextInput, toast } from '../../../core/ui';
import type { LocalDate } from '../../../core/domain/types';
import { txRepo } from '../data/repo';
import { kopecksText, toKopecks } from '../domain/money';
import { byUse } from '../domain/stats';
import type { Account, Category, Tx, TxKind } from '../domain/types';
import s from './Finance.module.css';

const TITLES: Record<TxKind, string> = { income: 'Доход', expense: 'Расход', transfer: 'Перевод' };

interface Props {
  kind: TxKind;
  tx: Tx | null;
  today: LocalDate;
  accounts: Account[];
  categories: Category[];
  txs: Tx[];
  onClose: () => void;
}

export function TxModal({ kind, tx, today, accounts, categories, txs, onClose }: Props) {
  const live = accounts.filter((a) => !a.archived || a.id === tx?.accountId || a.id === tx?.toAccountId);
  const last = useMemo(() => [...txs].sort((a, b) => b.createdAt - a.createdAt).find((t) => live.some((a) => a.id === t.accountId))?.accountId, [txs, live]);
  const tiles = useMemo(() => {
    const use = byUse(txs);
    return categories.filter((c) => c.kind === kind && (!c.archived || c.id === tx?.categoryId)).sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0));
  }, [categories, kind, tx, txs]);
  const [amount, setAmount] = useState(tx ? kopecksText(tx.amount) : '');
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? '');
  const [accountId, setAccountId] = useState(tx?.accountId ?? last ?? live[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(tx?.toAccountId ?? live.find((a) => a.id !== accountId)?.id ?? '');
  const [date, setDate] = useState(tx?.date ?? today);
  const [note, setNote] = useState(tx?.note ?? '');
  const [deleting, setDeleting] = useState(false);
  const accountOptions = live.map((a) => ({ value: a.id, label: a.name }));

  const save = async () => {
    const k = toKopecks(amount);
    if (!k) {
      toast('Укажите сумму', 'alert', 'var(--c-warn)');
      return;
    }
    if (kind !== 'transfer' && !categoryId) {
      toast('Выберите категорию', 'alert', 'var(--c-warn)');
      return;
    }
    if (kind === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      toast('Выберите другой счёт', 'alert', 'var(--c-warn)');
      return;
    }
    const { note: _n, categoryId: _c, toAccountId: _t, ...rest } = tx ?? ({} as Partial<Tx>);
    await txRepo.save({
      ...rest,
      kind,
      amount: k,
      date,
      accountId,
      ...(kind === 'transfer' ? { toAccountId } : { categoryId }),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    onClose();
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={TITLES[kind]} accent="var(--c-fin)" footer={
      <>
        {tx && <Button variant="ghost" icon="trash" label="Удалить операцию" onClick={() => setDeleting(true)} />}
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <TextInput label="Сумма, ₽" inputMode="decimal" autoFocus={!tx} value={amount} onChange={(e) => setAmount(e.target.value)} />
      {kind !== 'transfer' && (
        <Field label="Категория">
          <div className={s.tiles}>
            {tiles.map((c) => (
              <button key={c.id} type="button" className={s.tile} aria-pressed={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </Field>
      )}
      <div className={s.grid2}>
        <SelectInput label={kind === 'transfer' ? 'Откуда' : 'Счёт'} value={accountId} options={accountOptions} onChange={(e) => setAccountId(e.target.value)} />
        {kind === 'transfer' ? (
          <SelectInput label="Куда" value={toAccountId} options={accountOptions} onChange={(e) => setToAccountId(e.target.value)} />
        ) : (
          <TextInput label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
      </div>
      {kind === 'transfer' && <TextInput label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      <TextInput label="Заметка" value={note} onChange={(e) => setNote(e.target.value)} />
      <ConfirmDialog open={deleting} title="Удалить операцию?" onClose={() => setDeleting(false)} onConfirm={() => {
        if (tx) void txRepo.remove(tx.id);
        onClose();
      }}>
        {tx?.paymentId ? 'Срок платежа снова станет неоплаченным.' : 'Балансы и статистика пересчитаются.'}
      </ConfirmDialog>
    </Modal>
  );
}
