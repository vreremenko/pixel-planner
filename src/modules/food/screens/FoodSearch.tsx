/* Поиск еды: недавнее, частое, свои записи, справочник и магазинные продукты из Open Food Facts. */
import { useEffect, useMemo, useState } from 'react';
import { Button, Segmented } from '../../../core/ui';
import type { LocalDate } from '../../../core/domain/types';
import { useFoodItems, useHistory } from '../data/hooks';
import { CATALOG } from '../domain/catalog';
import { frequentFoods, macroLine, recentFoods, searchFoods } from '../domain/logic';
import type { FoodItem, FoodRef, Meal } from '../domain/types';
import { searchOff } from '../services/off';
import s from './Food.module.css';

export type Picked = FoodRef & { lastGrams?: number };

type Tab = 'all' | 'freq' | 'mine';
const TABS = [{ value: 'all', label: 'Все' }, { value: 'freq', label: 'Частые' }, { value: 'mine', label: 'Мои' }] as const;

/** Ждём паузу в наборе: у Open Food Facts лимит 10 поисков в минуту. */
const OFF_DELAY_MS = 700;
const OFF_MIN_CHARS = 3;
const offCache = new Map<string, FoodRef[]>();

type OffState = { status: 'loading' | 'error' } | { status: 'done'; list: FoodRef[] };

function useOffSearch(query: string, enabled: boolean): OffState | null {
  const [failed, setFailed] = useState<string | null>(null);
  const [, setLoaded] = useState('');
  const active = enabled && query.length >= OFF_MIN_CHARS;
  useEffect(() => {
    if (!active || offCache.has(query)) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchOff(query, ctrl.signal)
        .then((list) => {
          offCache.set(query, list);
          setLoaded(query);
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setFailed(query);
        });
    }, OFF_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, active]);
  if (!active) return null;
  const list = offCache.get(query);
  if (list) return { status: 'done', list };
  return { status: failed === query ? 'error' : 'loading' };
}

function Row({ food, onPick, onEdit }: { food: Picked; onPick: (f: Picked) => void; onEdit?: (() => void) | undefined }) {
  return (
    <li className={s.foodRow}>
      <button type="button" className={s.foodBtn} onClick={() => onPick(food)}>
        <span>
          {food.name}
          {food.brand ? ` · ${food.brand}` : ''}
        </span>
        <span className={s.dim}>
          {food.kcal} ккал · {macroLine(food)} на 100 г{food.lastGrams ? ` · в прошлый раз ${String(food.lastGrams)} г` : ''}
        </span>
      </button>
      {onEdit && <Button small variant="ghost" icon="edit" label={`Изменить: ${food.name}`} onClick={onEdit} />}
    </li>
  );
}

interface Props {
  date: LocalDate;
  meal: Meal;
  onPick: (food: Picked) => void;
  onEdit?: (item: FoodItem) => void;
}

export function FoodSearch({ date, meal, onPick, onEdit }: Props) {
  const [text, setText] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const history = useHistory(date);
  const items = useFoodItems();
  const query = text.trim();
  const off = useOffSearch(query, tab === 'all');

  const mine = useMemo(() => items ?? [], [items]);
  const recent = useMemo(() => recentFoods(history ?? [], meal), [history, meal]);
  const frequent = useMemo(() => frequentFoods(history ?? [], meal), [history, meal]);
  const local = useMemo(() => (query ? searchFoods<FoodRef>([...mine, ...CATALOG], query) : []), [mine, query]);
  const known = new Set(mine.map((x) => x.id));
  const offList = off?.status === 'done' ? off.list.filter((x) => !known.has(x.id)) : [];

  const list = (foods: readonly Picked[]) => (
    <ul className={s.foods}>
      {foods.map((f) => {
        const item = tab === 'mine' ? mine.find((x) => x.id === f.id) : undefined;
        return <Row key={f.id} food={f} onPick={onPick} onEdit={item && onEdit ? () => onEdit(item) : undefined} />;
      })}
    </ul>
  );

  return (
    <>
      <input className={s.search} value={text} placeholder="Творог, борщ, Простоквашино" aria-label="Поиск еды" onChange={(e) => setText(e.target.value)} data-autofocus />
      <div className={s.tabs}>
        <Segmented value={tab} options={TABS} onChange={setTab} label="Что показать" accent="var(--c-food)" />
      </div>
      {tab === 'all' && !query && (recent.length > 0 ? (
        <>
          <div className={s.label}>Недавнее</div>
          {list(recent)}
        </>
      ) : (
        <p className={s.hint}>Начните вводить название. Здесь появится то, что вы едите чаще.</p>
      ))}
      {tab === 'all' && query && (
        <>
          <div className={s.label}>Справочник и мои</div>
          {local.length > 0 ? list(local) : <p className={s.hint}>Здесь ничего не нашлось.</p>}
          {query.length >= OFF_MIN_CHARS && (
            <>
              <div className={s.label}>Магазинные продукты</div>
              {off?.status === 'loading' && <p className={`${s.status} ${s.searching}`} role="status">Ищем в Open Food Facts</p>}
              {off?.status === 'error' && <p className={`${s.status} ${s.statusError}`} role="status">Open Food Facts сейчас недоступен. Попробуйте позже или введите продукт вручную.</p>}
              {off?.status === 'done' && (offList.length > 0 ? list(offList) : <p className={s.hint}>В Open Food Facts такого нет.</p>)}
            </>
          )}
        </>
      )}
      {tab === 'freq' && ((query ? searchFoods(frequent, query) : frequent).length > 0 ? list(query ? searchFoods(frequent, query) : frequent) : <p className={s.hint}>Частые появятся, когда вы запишете еду несколько раз.</p>)}
      {tab === 'mine' && ((query ? searchFoods(mine, query) : mine).length > 0 ? list(query ? searchFoods(mine, query) : mine) : <p className={s.hint}>Своих продуктов и блюд пока нет.</p>)}
    </>
  );
}
