/* Ожидаемая выплата: название, сумма, повтор и ближайшая дата — зарплата, аванс, пенсия, стипендия. */
import { useState } from 'react';
import { Button, ConfirmDialog, DateField, Field, Modal, Segmented, TextInput, toast } from '../../../core/ui';
import type { LocalDate } from '../../../core/domain/types';
import { kopecksText, toKopecks } from '../domain/money';
import { REPEATS, type Payday, type Repeat } from '../domain/types';
import { removePayday, savePayday } from '../services/income';

export function PaydayEditor({ payday, today, onClose }: { payday: Payday | null; today: LocalDate; onClose: () => void }) {
  const [name, setName] = useState(payday?.name ?? 'Зарплата');
  const [amount, setAmount] = useState(payday ? kopecksText(payday.amount) : '');
  const [repeat, setRepeat] = useState<Repeat>(payday?.repeat ?? 'month');
  const [date, setDate] = useState(payday?.date ?? today);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    const k = toKopecks(amount);
    if (!name.trim() || !k || !date) {
      toast('Укажите название, сумму и дату', 'alert', 'var(--c-warn)');
      return;
    }
    await savePayday({ ...(payday ?? { id: crypto.randomUUID(), skipped: [] }), name: name.trim(), amount: k, repeat, date });
    onClose();
  };

  return (
    <Modal
      keepOnOutsideClick
      open
      onClose={onClose}
      title={payday ? 'Выплата' : 'Новая выплата'}
      accent="var(--c-fin)"
      footer={
        <>
          {payday && <Button variant="ghost" icon="trash" label="Удалить выплату" onClick={() => setDeleting(true)} />}
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => void save()}>
            Сохранить
          </Button>
        </>
      }
    >
      <TextInput label="Название" placeholder="Зарплата, аванс" value={name} onChange={(e) => setName(e.target.value)} />
      <TextInput label="Сумма, ₽" inputMode="decimal" placeholder="примерно, потом можно уточнить" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Field label="Повтор">
        <Segmented value={repeat} options={REPEATS} onChange={setRepeat} label="Повтор" accent="var(--c-fin)" />
      </Field>
      <DateField label={repeat === 'once' ? 'Дата' : 'Ближайшая дата'} value={date} onChange={setDate} accent="var(--c-fin)" />
      <ConfirmDialog
        open={deleting}
        title="Удалить выплату?"
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          if (payday) void removePayday(payday.id);
          onClose();
        }}
      >
        «{payday?.name}» пропадёт из расчёта. Уже записанные доходы останутся в операциях.
      </ConfirmDialog>
    </Modal>
  );
}
