/* Тренировки — раздел в разработке (виден только в dev-сборке). */
import { lazyScreen, type ModuleManifest } from '../../core/module';

export const gymModule: ModuleManifest = {
  id: 'gym',
  title: 'Тренировки',
  icon: 'dumbbell',
  accent: 'var(--c-gym)',
  status: 'draft',
  nav: [{ to: '/gym', label: 'Тренировки', short: 'Тренир.', icon: 'dumbbell', accent: 'var(--c-gym)' }],
  routes: [{ path: 'gym', Component: lazyScreen(() => import('./GymScreen'), (m) => m.GymScreen) }],
  widgets: [
    {
      id: 'gym',
      title: 'Тренировки',
      icon: 'dumbbell',
      accent: 'var(--c-gym)',
      to: '/gym',
      Component: lazyScreen(() => import('./GymScreen'), (m) => m.GymWidget),
    },
  ],
};
