/* Планировщик: задачи (день, бэклог, метки, повторы), привычки и статистика. */
import { lazyScreen, type ModuleManifest } from '../../core/module';

export const plannerModule: ModuleManifest = {
  id: 'planner',
  title: 'Планировщик',
  icon: 'calendar',
  accent: 'var(--c-task)',
  nav: [
    { to: '/day', label: 'День', short: 'День', icon: 'calendar', accent: 'var(--c-task)' },
    { to: '/backlog', label: 'Бэклог', short: 'Бэклог', icon: 'bag', accent: 'var(--c-backlog)' },
    { to: '/habits', label: 'Привычки', short: 'Привычки', icon: 'star', accent: 'var(--c-habit)' },
    { to: '/stats', label: 'Статистика', short: 'Стат.', icon: 'bars', accent: 'var(--c-gold)' },
  ],
  routes: [
    { path: 'day', Component: lazyScreen(() => import('./day/DayScreen'), (m) => m.DayScreen) },
    { path: 'backlog', Component: lazyScreen(() => import('./backlog/BacklogScreen'), (m) => m.BacklogScreen) },
    { path: 'habits', Component: lazyScreen(() => import('./habits/HabitsScreen'), (m) => m.HabitsScreen) },
    { path: 'stats', Component: lazyScreen(() => import('./stats/StatsScreen'), (m) => m.StatsScreen) },
    { path: 'tag/:tag', Component: lazyScreen(() => import('./tags/TagScreen'), (m) => m.TagScreen) },
  ],
  widgets: [
    {
      id: 'today',
      title: 'Сегодня',
      icon: 'calendar',
      accent: 'var(--c-task)',
      to: '/day',
      Component: lazyScreen(() => import('./widgets/TodayWidget'), (m) => m.TodayWidget),
    },
    {
      id: 'habits',
      title: 'Привычки',
      icon: 'star',
      accent: 'var(--c-habit)',
      to: '/habits',
      Component: lazyScreen(() => import('./widgets/HabitsWidget'), (m) => m.HabitsWidget),
    },
  ],
  globals: [lazyScreen(() => import('./day/TaskEditor'), (m) => m.TaskEditor)],
};
