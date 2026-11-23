/* «Пришла»: деньги от выплаты получены — записываем доход на счёт, суммой можно поправить. Либо в этот раз не будет. */
import { useState } from 'react';
import { Button, Modal, SelectInput, TextInput, toast } from '../../../core/ui';
import { formatDateShort } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { kopecksText, toKopecks } from '../domain/money';
import type { Expected } from '../domain/income';
import type { Account } from '../domain/types';
import { receivePayday, skipPayday } from '../services/income';

export function ReceiveModal({ expected, today, accounts, onClose }: { expected: Expected; today: LocalDate; accounts: Account[]; onClose: () => void }) {
  const [amount, setAmount] = useState(kopecksText(expected.amount));
  const [accountId, setAccountId] = useState(accounts.find((a) => a.inPlan)?.id ?? accounts[0]?.id ?? '');

  const receive = async () => {
    const k = toKopecks(amount);
    if (!k) {
      toast('Укажите сумму', 'alert', 'var(--c-warn)');
      return;
    }
    await receivePayday(expected, k, accountId, today);
    onClose();
  };

  return (
    <Modal
      keepOnOutsideClick
      open
      onClose={onClose}
      title={`${expected.name}, ${formatDateShort(expected.date)}`}
      accent="var(--c-fin)"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              void skipPayday(expected);
              onClose();
            }}
          >
            В этот раз не будет
          </Button>
          <Button variant="primary" onClick={() => void receive()}>
            Пришла
          </Button>
        </>
      }
    >
      <TextInput label="Сколько пришло, ₽" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <SelectInput label="На какой счёт" value={accountId} options={accounts.map((a) => ({ value: a.id, label: a.name }))} onChange={(e) => setAccountId(e.target.value)} />
    </Modal>
  );
}
