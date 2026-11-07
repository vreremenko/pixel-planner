/* Цель: название, сумма, дата, копилка и пауза. Всё можно поменять, деньги на счёте при этом остаются. */
import { useState } from 'react';
import { ToggleRow } from '../../../core/settings/ToggleRow';
import { Button, ConfirmDialog, Modal, SelectInput, TextInput, toast } from '../../../core/ui';
import { addDays } from '../../../core/domain/dates';
import type { LocalDate, Weekday } from '../../../core/domain/types';
import { accountRepo, goalRepo } from '../data/repo';
import { applyGoal, goalView } from '../domain/goals';
import { kopecksText, rubUp, toKopecks } from '../domain/money';
import { savingAccounts } from '../domain/save';
import type { Account, Goal, Kopecks } from '../domain/types';
import s from './Finance.module.css';

const NEW_JAR = 'new';

interface Props {
  goal: Goal | null;
  goals: readonly Goal[];
  accounts: Account[];
  balance: ReadonlyMap<string, Kopecks>;
  work: readonly Weekday[];
  today: LocalDate;
  onClose: () => void;
}

export function GoalEditor({ goal, goals, accounts, balance, work, today, onClose }: Props) {
  // Одна копилка — одна цель: иначе один баланс засчитался бы дважды
  const taken = new Set(goals.filter((g) => g.id !== goal?.id).map((g) => g.accountId));
  const jars = savingAccounts(accounts).filter((a) => !taken.has(a.id));
  const [name, setName] = useState(goal?.name ?? '');
  const [amount, setAmount] = useState(goal ? kopecksText(goal.amount) : '');
  const [date, setDate] = useState(goal?.date ?? addDays(today, 90));
  const [accountId, setAccountId] = useState(goal?.accountId ?? NEW_JAR);
  const [paused, setPaused] = useState(goal?.paused === true);
  const [deleting, setDeleting] = useState(false);
  const options = [...jars.map((a) => ({ value: a.id, label: a.name })), { value: NEW_JAR, label: 'Новая копилка' }];
  const saved = balance.get(accountId) ?? 0;
  const k = toKopecks(amount);

  const save = async () => {
    if (!name.trim() || !k) {
      toast('Укажите название и сумму', 'alert', 'var(--c-warn)');
      return;
    }
    if (date <= today) {
      toast('Дата должна быть позже сегодняшней', 'alert', 'var(--c-warn)');
      return;
    }
    const jar = accountId === NEW_JAR ? (await accountRepo.save({ name: `Копилка: ${name.trim()}`, start: 0, inPlan: false })).id : accountId;
    await goalRepo.save(applyGoal(goal, { name: name.trim(), amount: k, date, accountId: jar, paused }, saved, today));
    onClose();
  };

  const preview = k && date > today ? goalView({ ...applyGoal(goal, { name, amount: k, date, accountId, paused: false }, saved, today), id: '', createdAt: 0, updatedAt: 0 }, saved, 0, work, addDays(today, 1)) : null;

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={goal ? 'Цель' : 'Новая цель'} accent="var(--c-fin)" footer={
      <>
        {goal && <Button variant="ghost" icon="trash" label="Удалить цель" onClick={() => setDeleting(true)} />}
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <TextInput label="Название" placeholder="Компьютер" value={name} onChange={(e) => setName(e.target.value)} />
      <TextInput label="Сколько накопить, ₽" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <TextInput label="К какой дате" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <SelectInput label="Копилка" value={accountId} options={options} onChange={(e) => setAccountId(e.target.value)} />
      <p className={s.hint}>Деньги цели лежат на этом счёте вне плана. Переводите их туда кнопкой «Перевод».</p>
      {goal && <ToggleRow label="Поставить на паузу" hint="Цель пропадёт из плана, деньги останутся на счёте." checked={paused} onChange={setPaused} color="var(--c-fin)" />}
      {preview && preview.perDay > 0 && !paused && <p className={s.hint}>С этими настройками: {rubUp(preview.perDay)} в рабочий день.</p>}
      <ConfirmDialog open={deleting} title="Удалить цель?" onClose={() => setDeleting(false)} onConfirm={() => {
        if (goal) void goalRepo.remove(goal.id);
        onClose();
      }}>
        «{goal?.name}» пропадёт из плана. Деньги останутся на счёте.
      </ConfirmDialog>
    </Modal>
  );
}
