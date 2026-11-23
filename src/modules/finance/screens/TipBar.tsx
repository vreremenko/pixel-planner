/* Строка советов: один совет за раз, целиком (переносится на новую строку, а не едет). Нажатие — следующий совет. */
import { useMemo, useState } from 'react';
import type { LocalDate } from '../../../core/domain/types';
import type { PlanView } from '../data/hooks';
import { DEFAULT_SAVE_PERCENT, tips } from '../domain/tips';
import type { Category, Tx } from '../domain/types';
import s from './Finance.module.css';

export function TipBar({ today, view, txs, categories, savePercent }: { today: LocalDate; view: PlanView; txs: Tx[]; categories: Category[]; savePercent: number | undefined }) {
  const list = useMemo(
    () => tips({ today, money: view.money, living: view.living, dues: view.dues, covered: view.plan.rate === 0, txs, categories, savePercent: savePercent ?? DEFAULT_SAVE_PERCENT, mode: view.mode }),
    [today, view, txs, categories, savePercent],
  );
  const [index, setIndex] = useState(0);
  const text = list[index % list.length] ?? '';
  const many = list.length > 1;

  return (
    <button type="button" className={s.tip} aria-label={many ? `Совет: ${text} Следующий совет` : `Совет: ${text}`} onClick={() => many && setIndex((i) => (i + 1) % list.length)}>
      {text}
      {many && <span className={s.tipMore}> ›</span>}
    </button>
  );
}
