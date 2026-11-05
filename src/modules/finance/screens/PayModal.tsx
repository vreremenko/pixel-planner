/* Оплата срока: расход с поправкой суммы или пропуск срока. */
import { useState } from 'react';
import { Button, Modal, SelectInput, TextInput, toast } from '../../../core/ui';
import { formatDateShort } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { kopecksText, toKopecks } from '../domain/money';
import type { Due } from '../domain/plan';
import type { Account, Payment } from '../domain/types';
import { payDue, skipDue } from '../services/money';

interface Props {
  due: Due;
  today: LocalDate;
  accounts: Account[];
  payment: Payment | undefined;
  onClose: () => void;
}

export function PayModal({ due, today, accounts, payment, onClose }: Props) {
  const [amount, setAmount] = useState(kopecksText(due.amount));
  const [accountId, setAccountId] = useState(accounts.find((a) => a.inPlan)?.id ?? accounts[0]?.id ?? '');

  const pay = async () => {
    const k = toKopecks(amount);
    if (!k) {
      toast('Укажите сумму', 'alert', 'var(--c-warn)');
      return;
    }
    await payDue(due, k, accountId, today);
    onClose();
  };

  const skip = async () => {
    if (payment) await skipDue(payment, due.date);
    onClose();
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={`${due.name}, ${formatDateShort(due.date)}`} accent="var(--c-fin)" footer={
      <>
        <Button variant="ghost" onClick={() => void skip()}>Пропустить срок</Button>
        <Button variant="primary" onClick={() => void pay()}>Оплатить</Button>
      </>
    }>
      <TextInput label="Сумма, ₽" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <SelectInput label="Счёт" value={accountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} onChange={(e) => setAccountId(e.target.value)} />
    </Modal>
  );
}
