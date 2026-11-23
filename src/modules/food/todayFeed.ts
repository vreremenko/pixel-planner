/* Питание в «Сегодня»: сколько калорий съедено и какая норма. Дел нет — приёмы пищи не по часам. */
import type { LocalDate } from '../../core/domain/types';
import type { TodayFeed } from '../../core/module';
import { entryRepo, prefsRepo } from './data/repo';
import { sumEntries } from './domain/logic';

export async function loadToday(today: LocalDate): Promise<TodayFeed> {
  const [entries, prefs] = await Promise.all([entryRepo.byDate(today), prefsRepo.get()]);
  const kcal = Math.round(sumEntries(entries).kcal);
  const goal = prefs.goal?.kcal;
  if (entries.length === 0 && !goal) return { items: [] };
  return { items: [], stat: { id: 'food', label: 'Еда', value: goal ? `${String(kcal)} из ${String(Math.round(goal))} ккал` : `${String(kcal)} ккал`, to: '/food', accent: 'var(--c-food)' } };
}
