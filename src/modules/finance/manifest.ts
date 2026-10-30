/* Финансы — раздел в разработке (виден только в dev-сборке). */
import { lazyScreen, type ModuleManifest } from '../../core/module';

export const financeModule: ModuleManifest = {
  id: 'finance',
  title: 'Финансы',
  icon: 'coin',
  accent: 'var(--c-fin)',
  status: 'draft',
  nav: [{ to: '/finance', label: 'Финансы', short: 'Финансы', icon: 'coin', accent: 'var(--c-fin)' }],
  routes: [{ path: 'finance', Component: lazyScreen(() => import('./FinanceScreen'), (m) => m.FinanceScreen) }],
  widgets: [
    {
      id: 'finance',
      title: 'Финансы',
      icon: 'coin',
      accent: 'var(--c-fin)',
      to: '/finance',
      Component: lazyScreen(() => import('./FinanceScreen'), (m) => m.FinanceWidget),
    },
  ],
};
