/*
 * Как вы получаете деньги: короткий мастер. Выбор режима, для зарплаты — когда и сколько приходит,
 * и (если счёта ещё нет) сколько денег сейчас. Всё потом меняется в настройках.
 */
import { useState } from 'react';
import { Button, DateField, Field, Panel, Segmented, TextInput, cx, toast } from '../../../core/ui';
import type { LocalDate } from '../../../core/domain/types';
import { ToggleRow } from '../../../core/settings/ToggleRow';
import { accountRepo } from '../data/repo';
import { toKopecks } from '../domain/money';
import { INCOME_MODES, REPEATS, type IncomeMode, type Repeat } from '../domain/types';
import { savePayday, setIncomeMode } from '../services/income';
import s from './Finance.module.css';

interface Row {
  name: string;
  amount: string;
  date: LocalDate;
  repeat: Repeat;
}

function PaydayFields({ row, onChange, label }: { row: Row; onChange: (r: Row) => void; label: string }) {
  return (
    <div className={s.paydayBox}>
      <TextInput label={`${label}: название`} value={row.name} onChange={(e) => onChange({ ...row, name: e.target.value })} />
      <TextInput label="Сколько приходит, ₽ (примерно)" inputMode="decimal" placeholder="например, 60 000" value={row.amount} onChange={(e) => onChange({ ...row, amount: e.target.value })} />
      <Field label="Как часто">
        <Segmented value={row.repeat} options={REPEATS.filter((r) => r.value !== 'year')} onChange={(repeat) => onChange({ ...row, repeat })} label="Как часто" accent="var(--c-fin)" />
      </Field>
      <DateField label={row.repeat === 'once' ? 'Когда' : 'Ближайшая дата'} value={row.date} onChange={(date) => onChange({ ...row, date })} accent="var(--c-fin)" />
    </div>
  );
}

export function IncomeSetup({ needAccount, today, onDone, onSkip }: { needAccount: boolean; today: LocalDate; onDone: () => void; onSkip?: () => void }) {
  const [mode, setMode] = useState<IncomeMode>('salary');
  const [first, setFirst] = useState<Row>({ name: 'Зарплата', amount: '', date: today, repeat: 'month' });
  const [second, setSecond] = useState<Row | null>(null);
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);

  const done = async () => {
    const money = balance.trim() ? toKopecks(balance) : 0;
    if (needAccount && money === null) {
      toast('Сумма на карте — числом, например 15 000', 'alert', 'var(--c-warn)');
      return;
    }
    const rows = mode === 'salary' ? [first, ...(second ? [second] : [])] : [];
    for (const r of rows) {
      if (!r.name.trim() || !toKopecks(r.amount)) {
        toast('Для выплаты укажите название и сумму', 'alert', 'var(--c-warn)');
        return;
      }
    }
    setBusy(true);
    try {
      if (needAccount) await accountRepo.save({ name: 'Карта', start: money ?? 0, inPlan: true });
      for (const r of rows) await savePayday({ id: crypto.randomUUID(), name: r.name.trim(), amount: toKopecks(r.amount) ?? 0, repeat: r.repeat, date: r.date, skipped: [] });
      await setIncomeMode(mode);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Как вы получаете деньги?" icon="coin" accent="var(--c-fin)">
      <p className={s.hint} style={{ marginTop: 0 }}>
        От этого зависит главная цифра: сколько можно тратить сегодня, сколько осталось заработать или на сколько дней хватит денег. Потом можно поменять в «Настройках».
      </p>
      <div className={s.modes} role="radiogroup" aria-label="Как вы получаете деньги">
        {INCOME_MODES.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} className={cx(s.mode, mode === m.value && s.modeOn)} onClick={() => setMode(m.value)}>
            <b>{m.label}</b>
            <span className={s.dim}>{m.hint}</span>
          </button>
        ))}
      </div>
      {mode === 'salary' && (
        <>
          <PaydayFields row={first} onChange={setFirst} label="Выплата" />
          <ToggleRow
            label="Есть ещё выплата (аванс, вторая часть)"
            checked={second !== null}
            onChange={(on) => setSecond(on ? { name: 'Аванс', amount: '', date: today, repeat: 'month' } : null)}
            color="var(--c-fin)"
          />
          {second && <PaydayFields row={second} onChange={setSecond} label="Вторая выплата" />}
        </>
      )}
      {needAccount && <TextInput label="Сколько денег сейчас на карте или в наличных, ₽" inputMode="decimal" placeholder="например, 25 000" value={balance} onChange={(e) => setBalance(e.target.value)} />}
      <div className={s.actions}>
        <Button variant="primary" icon="check" disabled={busy} onClick={() => void done()}>
          Готово
        </Button>
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Позже
          </Button>
        )}
      </div>
    </Panel>
  );
}
