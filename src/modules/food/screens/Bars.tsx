/* Полосы калорий и БЖУ: съедено, цель, остаток. Общие для дневника и карточки на «Сводке». */
import type { CSSProperties } from 'react';
import { cx } from '../../../core/ui';
import type { Macros } from '../domain/types';
import s from './Food.module.css';

function Bar({ label, value, goal, color }: { label: string; value: number; goal: number | undefined; color: string }) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  const over = goal !== undefined && goal > 0 && value > goal;
  return (
    <div className={s.bar} style={{ '--bar': over ? 'var(--c-warn)' : color } as CSSProperties}>
      <div className={s.barHead}>
        <span>{label}</span>
        <span className={s.dim}>
          {Math.round(value)}
          {goal ? ` / ${String(goal)}` : ''}
        </span>
      </div>
      <div className={s.track}>
        <i style={{ width: `${String(pct)}%` }} />
      </div>
    </div>
  );
}

export function Bars({ eaten, goal }: { eaten: Macros; goal: Macros | undefined }) {
  const left = goal ? goal.kcal - eaten.kcal : 0;
  const pct = goal?.kcal ? Math.min(100, (eaten.kcal / goal.kcal) * 100) : 0;
  return (
    <>
      <div className={s.kcalRow}>
        <span className={cx(s.kcal, left < 0 && s.over)}>{eaten.kcal.toLocaleString('ru-RU')}</span>
        <span className={s.dim}>{goal ? `из ${goal.kcal.toLocaleString('ru-RU')} · ${left >= 0 ? `осталось ${left.toLocaleString('ru-RU')}` : `сверх нормы ${(-left).toLocaleString('ru-RU')}`}` : 'ккал'}</span>
      </div>
      <div className={s.track} style={{ '--bar': left < 0 ? 'var(--c-warn)' : 'var(--c-food)' } as CSSProperties}>
        <i style={{ width: `${String(pct)}%` }} />
      </div>
      <div className={s.macros}>
        <Bar label="Белки, г" value={eaten.protein} goal={goal?.protein} color="var(--c-task)" />
        <Bar label="Жиры, г" value={eaten.fat} goal={goal?.fat} color="var(--c-gold)" />
        <Bar label="Углев., г" value={eaten.carbs} goal={goal?.carbs} color="var(--c-gym)" />
      </div>
    </>
  );
}
