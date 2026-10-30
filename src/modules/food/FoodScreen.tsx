import { ComingSoon } from '../../core/shell/ComingSoon';

export function FoodScreen() {
  return (
    <ComingSoon title="Питание" icon="apple" accent="var(--c-food)">
      <p style={{ margin: 0 }}>Дневник еды, калории и БЖУ, поиск по базе продуктов Open Food Facts и свои блюда.</p>
    </ComingSoon>
  );
}

export function FoodWidget() {
  return <p style={{ margin: 0, color: 'var(--c-text-dim)' }}>Раздел в разработке. Здесь будут калории и БЖУ за сегодня.</p>;
}
