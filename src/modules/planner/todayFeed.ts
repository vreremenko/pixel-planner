/* Планировщик в «Сегодня»: задачи дня, повторы и привычки, которые ждут отметки. */
import type { LocalDate } from '../../core/domain/types';
import type { TodayFeed, TodayItem } from '../../core/module';
import { habitLogRepo, habitRepo, taskRepo } from './data/repo';
import { loadOccurrences } from './data/hooks';
import { isDue } from './domain/streaks';
import { isCountHabit } from './domain/types';
import { toggleHabit } from './services/habits';
import { toggleOccurrence, toggleTask } from './services/tasks';

export async function loadToday(today: LocalDate): Promise<TodayFeed> {
  const [tasks, occ, habits, logs] = await Promise.all([taskRepo.byDate(today), loadOccurrences(today, today, today), habitRepo.all(), habitLogRepo.byDateRange(today, today)]);
  const task = { icon: 'calendar', accent: 'var(--c-task)', to: '/day' } as const;
  const doneHabits = new Map(logs.map((l) => [l.habitId, l]));

  const dayItems: TodayItem[] = [
    ...tasks.map((t): TodayItem => ({ ...task, id: `task:${t.id}`, title: t.title, time: t.time, done: t.done, toggle: (d) => toggleTask(t, d) })),
    ...occ.filter((o) => o.status !== 'skipped').map((o): TodayItem => ({ ...task, id: `occ:${o.key}`, title: o.title, time: o.time, done: o.status === 'done', toggle: (d) => toggleOccurrence(o, d) })),
  ];
  const habitItems = habits
    .filter((h) => !h.archived && isDue(h, today))
    .sort((a, b) => a.order - b.order)
    .map((h): TodayItem => {
      const log = doneHabits.get(h.id);
      const count = isCountHabit(h);
      return {
        id: `habit:${h.id}`,
        title: h.name,
        time: h.reminderTime,
        done: !!log,
        to: '/habits',
        icon: 'star',
        accent: 'var(--c-habit)',
        // Счётная привычка записывается числом на своём экране, отметкой не закрывается
        ...(count ? { detail: `привычка · ${log?.value ? `${String(log.value)} ${h.tracking.unit}` : `${h.tracking.unit}: пока 0`}` } : { detail: 'привычка', toggle: (d: boolean) => toggleHabit(h, today, d) }),
      };
    });
  const total = dayItems.length;
  const done = dayItems.filter((i) => i.done).length;
  return { items: [...dayItems, ...habitItems], ...(total > 0 ? { stat: { id: 'tasks', label: 'Дела', value: `${String(done)} из ${String(total)}`, to: '/day', accent: 'var(--c-task)' } } : {}) };
}
