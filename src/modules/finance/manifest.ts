/* Финансы: доходы и расходы, счета, статистика и план заработка к срокам обязательных платежей. */
import { lazyScreen, type ModuleManifest } from '../../core/module';

export const financeModule: ModuleManifest = {
  id: 'finance',
  title: 'Финансы',
  icon: 'coin',
  accent: 'var(--c-fin)',
  nav: [{ to: '/finance', label: 'Финансы', short: 'Финансы', icon: 'coin', accent: 'var(--c-fin)' }],
  routes: [{ path: 'finance', Component: lazyScreen(() => import('./screens/FinanceScreen'), (m) => m.FinanceScreen) }],
  widgets: [
    {
      id: 'finance',
      title: 'Финансы',
      icon: 'coin',
      accent: 'var(--c-fin)',
      to: '/finance',
      Component: lazyScreen(() => import('./screens/FinanceWidget'), (m) => m.FinanceWidget),
    },
  ],
};
