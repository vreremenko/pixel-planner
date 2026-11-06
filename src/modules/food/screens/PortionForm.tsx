/* Граммовка: быстрые кнопки, ввод и живой пересчёт КБЖУ. */
import { useState } from 'react';
import { Button, cx } from '../../../core/ui';
import { parseValue } from '../../../core/domain/numbers';
import { macroLine, portionOf } from '../domain/logic';
import type { Macros } from '../domain/types';
import s from './Food.module.css';

const QUICK = [50, 100, 150, 200];

interface Props {
  food: Macros & { name: string; portion?: number };
  grams: number;
  action: string;
  onSubmit: (grams: number) => void;
}

export function PortionForm({ food, grams: initial, action, onSubmit }: Props) {
  const [text, setText] = useState(String(initial));
  const grams = parseValue(text) ?? 0;
  const part = portionOf(food, grams);
  const quick = [...new Set([...QUICK, ...(food.portion ? [food.portion] : [])])].sort((a, b) => a - b);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (grams > 0) onSubmit(grams);
      }}
    >
      <div className={s.chips}>
        {quick.map((g) => (
          <button key={g} type="button" className={cx(s.chip, g === grams && s.chipOn)} onClick={() => setText(String(g))}>
            {g} г
          </button>
        ))}
      </div>
      <label className={s.grams}>
        <input className={s.search} inputMode="decimal" value={text} aria-label="Граммы" data-select data-autofocus onChange={(e) => setText(e.target.value)} />
        <span>г</span>
      </label>
      <p className={s.total}>
        <b>{part.kcal} ккал</b> <span className={s.dim}>{macroLine(part)}</span>
      </p>
      <Button type="submit" variant="primary" disabled={grams <= 0} className={s.wide}>
        {action}
      </Button>
    </form>
  );
}
