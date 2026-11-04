/* Питание: дневник калорий и БЖУ, цели, справочник, продукты из Open Food Facts и свои блюда. */
import { lazyScreen, type ModuleManifest } from '../../core/module';

export const foodModule: ModuleManifest = {
  id: 'food',
  title: 'Питание',
  icon: 'apple',
  accent: 'var(--c-food)',
  nav: [{ to: '/food', label: 'Питание', short: 'Питание', icon: 'apple', accent: 'var(--c-food)' }],
  routes: [{ path: 'food', Component: lazyScreen(() => import('./screens/FoodDiary'), (m) => m.FoodDiary) }],
  widgets: [
    {
      id: 'food',
      title: 'Питание',
      icon: 'apple',
      accent: 'var(--c-food)',
      to: '/food',
      Component: lazyScreen(() => import('./screens/FoodWidget'), (m) => m.FoodWidget),
    },
  ],
};
