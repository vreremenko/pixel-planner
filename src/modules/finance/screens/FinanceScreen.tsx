/* Финансы: план на день, операции и статистика. */
import { useState } from 'react';
import { Button, Panel, Segmented } from '../../../core/ui';
import { TopbarActions } from '../../../core/shell/TopbarActions';
import { useToday } from '../../../core/shell/useToday';
import { useAccounts, useCategories, usePayments, usePlan, usePrefs, useTxs } from '../data/hooks';
import type { Tx, TxKind } from '../domain/types';
import { AccountForm } from './AccountsModal';
import { PlanPrefsModal } from './PlanPrefsModal';
import { PlanTab } from './PlanTab';
import { StatsTab } from './StatsTab';
import { TipBar } from './TipBar';
import { TxList } from './TxList';
import { TxModal } from './TxModal';
import s from './Finance.module.css';

const TABS = [
  { value: 'plan', label: 'План' },
  { value: 'list', label: 'Операции' },
  { value: 'stats', label: 'Статистика' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export function FinanceScreen() {
  const today = useToday();
  const accounts = useAccounts();
  const categories = useCategories();
  const txs = useTxs();
  const payments = usePayments();
  const prefs = usePrefs();
  const view = usePlan(today);
  const [tab, setTab] = useState<Tab>('plan');
  const [month, setMonth] = useState(today);
  const [entry, setEntry] = useState<{ kind: TxKind; tx: Tx | null } | null>(null);
  const [settings, setSettings] = useState(false);
  if (!accounts || !categories || !txs || !payments || !prefs || !view) return null;
  const live = accounts.filter((a) => !a.archived);

  return (
    <>
      <div className={s.head}>
        <h1 className="glow pageTitle" style={{ color: 'var(--c-fin)' }}>
          Финансы
        </h1>
        <TopbarActions>
          <Button small onClick={() => setSettings(true)}>
            Настройки
          </Button>
        </TopbarActions>
      </div>
      {live.length === 0 ? (
        <Panel title="Первый счёт" icon="coin" accent="var(--c-fin)">
          <p className={s.hint}>Укажите, сколько денег сейчас на карте или в наличных. От этой суммы считается план.</p>
          <AccountForm account={null} onDone={() => undefined} />
        </Panel>
      ) : (
        <>
          {!prefs.tipsOff && <TipBar today={today} view={view} txs={txs} categories={categories} savePercent={prefs.saveOn ? 0 : prefs.savePercent} />}
          <Segmented value={tab} options={TABS} onChange={setTab} label="Вкладки финансов" accent="var(--c-fin)" />
          <div className={s.actions}>
            <Button variant="primary" icon="plus" onClick={() => setEntry({ kind: 'income', tx: null })}>
              Доход
            </Button>
            <Button icon="plus" onClick={() => setEntry({ kind: 'expense', tx: null })}>
              Расход
            </Button>
            {live.length > 1 && <Button onClick={() => setEntry({ kind: 'transfer', tx: null })}>Перевод</Button>}
          </div>
          {tab === 'plan' && <PlanTab today={today} view={view} accounts={accounts} payments={payments} txs={txs} />}
          {tab === 'list' && <TxList month={month} onMonth={setMonth} txs={txs} accounts={accounts} categories={categories} onOpen={(t) => setEntry({ kind: t.kind, tx: t })} />}
          {tab === 'stats' && <StatsTab month={month} onMonth={setMonth} txs={txs} categories={categories} />}
        </>
      )}
      {entry && <TxModal key={entry.tx?.id ?? entry.kind} kind={entry.kind} tx={entry.tx} today={today} accounts={accounts} categories={categories} txs={txs} view={view} prefs={prefs} onClose={() => setEntry(null)} />}
      {settings && <PlanPrefsModal prefs={prefs} accounts={accounts} average={view.average} categories={categories} onClose={() => setSettings(false)} />}
    </>
  );
}
