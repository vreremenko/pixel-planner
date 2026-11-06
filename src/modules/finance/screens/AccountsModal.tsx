/* Счета: название, начальный остаток, участие в плане. */
import { useState } from 'react';
import { ToggleRow } from '../../../core/settings/ToggleRow';
import { Button, Modal, TextInput, toast } from '../../../core/ui';
import { accountRepo } from '../data/repo';
import { kopecksText, rub, toKopecks } from '../domain/money';
import type { Account, Kopecks } from '../domain/types';
import s from './Finance.module.css';

export function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [start, setStart] = useState(account ? kopecksText(account.start) : '');
  const [inPlan, setInPlan] = useState(account?.inPlan ?? true);

  const save = async () => {
    const k = toKopecks(start || '0');
    if (!name.trim() || k === null) {
      toast('Укажите название и сумму', 'alert', 'var(--c-warn)');
      return;
    }
    await accountRepo.save({ ...account, name: name.trim(), start: k, inPlan });
    onDone();
  };

  return (
    <>
      <TextInput label="Название" placeholder="Карта" value={name} onChange={(e) => setName(e.target.value)} />
      <TextInput label={account ? 'Начальный остаток, ₽' : 'Сколько там сейчас, ₽'} inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
      <ToggleRow checked={inPlan} onChange={setInPlan} label="Учитывать в плане" hint="Эти деньги пойдут на платежи. Для копилки галочку лучше снять." color="var(--c-fin)" />
      <div className={s.actions}>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
        {account && <Button variant="ghost" icon="trash" onClick={() => void accountRepo.save({ ...account, archived: true }).then(onDone)}>В архив</Button>}
      </div>
    </>
  );
}

export function AccountsModal({ accounts, balance, onClose }: { accounts: Account[]; balance: Map<string, Kopecks>; onClose: () => void }) {
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={editing ? (editing === 'new' ? 'Новый счёт' : editing.name) : 'Счета'} accent="var(--c-fin)">
      {editing ? (
        <AccountForm key={editing === 'new' ? 'new' : editing.id} account={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      ) : (
        <>
          <ul className={s.list}>
            {accounts.filter((a) => !a.archived).map((a) => (
              <li key={a.id} className={s.row}>
                <button type="button" className={s.rowBtn} onClick={() => setEditing(a)}>
                  <span className={s.grow}>{a.name}</span>
                  <span className={s.amount}>{rub(balance.get(a.id) ?? 0)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className={s.actions}>
            <Button icon="plus" onClick={() => setEditing('new')}>Добавить счёт</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
