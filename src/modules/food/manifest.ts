/* Питание — раздел в разработке (виден только в dev-сборке). */
import { lazyScreen, type ModuleManifest } from '../../core/module';

export const foodModule: ModuleManifest = {
  id: 'food',
  title: 'Питание',
  icon: 'apple',
  accent: 'var(--c-food)',
  status: 'draft',
  nav: [{ to: '/food', label: 'Питание', short: 'Питание', icon: 'apple', accent: 'var(--c-food)' }],
  routes: [{ path: 'food', Component: lazyScreen(() => import('./FoodScreen'), (m) => m.FoodScreen) }],
  widgets: [
    {
      id: 'food',
      title: 'Питание',
      icon: 'apple',
      accent: 'var(--c-food)',
      to: '/food',
      Component: lazyScreen(() => import('./FoodScreen'), (m) => m.FoodWidget),
    },
  ],
};
