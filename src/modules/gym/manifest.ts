/* Тренировки: программа по дням, свободные тренировки, подходы, таймер отдыха, справочник упражнений. */
import { lazyScreen, type ModuleManifest } from '../../core/module';

export const gymModule: ModuleManifest = {
  id: 'gym',
  title: 'Тренировки',
  icon: 'dumbbell',
  accent: 'var(--c-gym)',
  nav: [
    { to: '/gym', label: 'Тренировка', short: 'Трен.', icon: 'dumbbell', accent: 'var(--c-gym)' },
    { to: '/gym/programs', label: 'Программа', short: 'Прогр.', icon: 'book', accent: 'var(--c-gym)' },
    { to: '/gym/exercises', label: 'Упражнения', short: 'Упражн.', icon: 'search', accent: 'var(--c-gym)' },
  ],
  routes: [
    { path: 'gym', Component: lazyScreen(() => import('./screens/GymHome'), (m) => m.GymHome) },
    { path: 'gym/workout/:id', Component: lazyScreen(() => import('./screens/WorkoutScreen'), (m) => m.WorkoutScreen) },
    { path: 'gym/programs', Component: lazyScreen(() => import('./screens/ProgramsScreen'), (m) => m.ProgramsScreen) },
    { path: 'gym/exercises', Component: lazyScreen(() => import('./screens/ExercisesScreen'), (m) => m.ExercisesScreen) },
    { path: 'gym/exercises/:id', Component: lazyScreen(() => import('./screens/ExerciseCard'), (m) => m.ExerciseCard) },
  ],
  widgets: [
    { id: 'gym', title: 'Тренировки', icon: 'dumbbell', accent: 'var(--c-gym)', to: '/gym', Component: lazyScreen(() => import('./screens/GymWidget'), (m) => m.GymWidget) },
  ],
  settingsPanel: lazyScreen(() => import('./screens/GymSettings'), (m) => m.GymSettings),
  globals: [lazyScreen(() => import('./screens/RestTimerBar'), (m) => m.RestTimerBar)],
};
