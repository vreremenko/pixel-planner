/* Обязательный платёж: название, сумма, категория, повтор и первый срок. */
import { useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, Segmented, SelectInput, TextInput, toast } from '../../../core/ui';
import type { LocalDate } from '../../../core/domain/types';
import { useCategories } from '../data/hooks';
import { paymentRepo } from '../data/repo';
import { kopecksText, toKopecks } from '../domain/money';
import { REPEATS, type Payment, type Repeat } from '../domain/types';

export function PaymentEditor({ payment, today, onClose }: { payment: Payment | null; today: LocalDate; onClose: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState(payment?.name ?? '');
  const [amount, setAmount] = useState(payment ? kopecksText(payment.amount) : '');
  const [categoryId, setCategoryId] = useState(payment?.categoryId ?? 'def:home');
  const [repeat, setRepeat] = useState<Repeat>(payment?.repeat ?? 'month');
  const [date, setDate] = useState(payment?.date ?? today);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    const k = toKopecks(amount);
    if (!name.trim() || !k || !date) {
      toast('Укажите название, сумму и дату', 'alert', 'var(--c-warn)');
      return;
    }
    await paymentRepo.save({ ...(payment ?? { skipped: [] }), name: name.trim(), amount: k, categoryId, repeat, date });
    onClose();
  };

  const options = (categories ?? []).filter((c) => c.kind === 'expense' && (!c.archived || c.id === categoryId)).map((c) => ({ value: c.id, label: c.name }));

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={payment ? 'Платёж' : 'Новый платёж'} accent="var(--c-fin)" footer={
      <>
        {payment && <Button variant="ghost" icon="trash" label="Удалить платёж" onClick={() => setDeleting(true)} />}
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <TextInput label="Название" placeholder="Квартира" value={name} onChange={(e) => setName(e.target.value)} />
      <TextInput label="Сумма, ₽" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Field label="Повтор">
        <Segmented value={repeat} options={REPEATS} onChange={setRepeat} label="Повтор" accent="var(--c-fin)" />
      </Field>
      <TextInput label={repeat === 'once' ? 'Дата' : 'Ближайшая дата'} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <SelectInput label="Категория" value={categoryId} options={options} onChange={(e) => setCategoryId(e.target.value)} />
      <ConfirmDialog open={deleting} title="Удалить платёж?" onClose={() => setDeleting(false)} onConfirm={() => {
        if (payment) void paymentRepo.remove(payment.id);
        onClose();
      }}>
        «{payment?.name}» пропадёт из плана. Уже записанные оплаты останутся в операциях.
      </ConfirmDialog>
    </Modal>
  );
}
