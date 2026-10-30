import { ComingSoon } from '../../core/shell/ComingSoon';

export function FinanceScreen() {
  return (
    <ComingSoon title="Финансы" icon="coin" accent="var(--c-fin)">
      <p style={{ margin: 0 }}>Доходы и расходы по категориям, бюджет на месяц, графики.</p>
    </ComingSoon>
  );
}

export function FinanceWidget() {
  return <p style={{ margin: 0, color: 'var(--c-text-dim)' }}>Раздел в разработке. Здесь будут расходы за месяц и остаток бюджета.</p>;
}
