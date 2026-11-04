/* Карточка «Питание» на сводке: калории и БЖУ за сегодня. */
import { useToday } from '../../../core/shell/useToday';
import { useDayEntries, useFoodPrefs } from '../data/hooks';
import { sumEntries } from '../domain/logic';
import { Bars } from './Bars';

export function FoodWidget() {
  const todayDate = useToday();
  const entries = useDayEntries(todayDate);
  const prefs = useFoodPrefs();
  if (!entries || !prefs) return null;
  return <Bars eaten={sumEntries(entries)} goal={prefs.goal} />;
}
