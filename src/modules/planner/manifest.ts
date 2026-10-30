/* Планировщик: задачи (день, инвентарь, метки, повторы), привычки и статистика. */
import { lazyScreen, type ModuleManifest } from '../../core/module';

const DayScreen = lazyScreen(() => import('./day/DayScreen'), (m) => m.DayScreen);

export const plannerModule: ModuleManifest = {
  id: 'planner',
  title: 'Планировщик',
  nav: [
    { to: '/', label: 'Уровень дня', short: 'День', icon: 'calendar', accent: 'var(--c-task)' },
    { to: '/backlog', label: 'Инвентарь', short: 'Инвент.', icon: 'bag', accent: 'var(--c-backlog)' },
    { to: '/habits', label: 'Квесты', short: 'Квесты', icon: 'star', accent: 'var(--c-habit)' },
    { to: '/stats', label: 'Рекорды', short: 'Рекорды', icon: 'bars', accent: 'var(--c-xp)' },
  ],
  routes: [
    { index: true, Component: DayScreen },
    { path: 'backlog', Component: lazyScreen(() => import('./backlog/BacklogScreen'), (m) => m.BacklogScreen) },
    { path: 'habits', Component: lazyScreen(() => import('./habits/HabitsScreen'), (m) => m.HabitsScreen) },
    { path: 'stats', Component: lazyScreen(() => import('./stats/StatsScreen'), (m) => m.StatsScreen) },
    { path: 'tag/:tag', Component: lazyScreen(() => import('./tags/TagScreen'), (m) => m.TagScreen) },
  ],
  globals: [lazyScreen(() => import('./day/TaskEditor'), (m) => m.TaskEditor)],
};
