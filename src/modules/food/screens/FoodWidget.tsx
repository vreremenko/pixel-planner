/* Карточка «Питание» на сводке: калории и БЖУ за сегодня. */
import { useToday } from '../../../core/shell/useToday';
import { useDayEntries, useFoodPrefs } from '../data/hooks';
import { sumEntries } from '../domain/logic';
import { Link } from 'react-router';
import { Bars } from './Bars';
import s from './Food.module.css';

export function FoodWidget() {
  const todayDate = useToday();
  const entries = useDayEntries(todayDate);
  const prefs = useFoodPrefs();
  if (!entries || !prefs) return null;
  return (
    <>
      <Bars eaten={sumEntries(entries)} goal={prefs.goal} />
      {entries.length === 0 && (
        <p className={s.hint} style={{ marginBottom: 0 }}>
          {prefs.goal ? 'Сегодня ещё ничего не записано. ' : 'Норма не задана — посчитаем по росту, весу и цели. '}
          <Link to="/food">{prefs.goal ? 'Записать еду' : 'Посчитать'}</Link>
        </p>
      )}
    </>
  );
}
