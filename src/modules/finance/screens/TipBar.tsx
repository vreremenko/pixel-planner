/* Строка советов: один совет за раз; едет, только если не влез. Нажатие ставит на паузу, следующее листает. */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LocalDate } from '../../../core/domain/types';
import type { PlanView } from '../data/hooks';
import { DEFAULT_SAVE_PERCENT, tips } from '../domain/tips';
import type { Category, Tx } from '../domain/types';
import { cx } from '../../../core/ui';
import s from './Finance.module.css';

/** Пикселей в секунду: столько успевает читать глаз на телефоне. */
const SPEED = 40;
/** Часть цикла, которую текст стоит в начале и в конце. */
const MOVING_SHARE = 0.7;

export function TipBar({ today, view, txs, categories, savePercent }: { today: LocalDate; view: PlanView; txs: Tx[]; categories: Category[]; savePercent: number | undefined }) {
  const list = useMemo(
    () => tips({ today, money: view.money, living: view.living, dues: view.dues, covered: view.plan.rate === 0, txs, categories, savePercent: savePercent ?? DEFAULT_SAVE_PERCENT }),
    [today, view, txs, categories, savePercent],
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [shift, setShift] = useState(0);
  const box = useRef<HTMLButtonElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const text = list[index % list.length] ?? '';

  useLayoutEffect(() => {
    const b = box.current;
    const l = line.current;
    if (!b || !l) return;
    const measure = () => {
      const { paddingLeft, paddingRight } = getComputedStyle(b);
      setShift(Math.max(0, Math.ceil(l.scrollWidth - b.clientWidth + parseFloat(paddingLeft) + parseFloat(paddingRight))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(b);
    observer.observe(l);
    return () => observer.disconnect();
  }, [text]);

  const moving = shift > 0;
  const next = () => {
    if (moving && !paused) {
      setPaused(true);
      return;
    }
    setPaused(false);
    setIndex((i) => (i + 1) % list.length);
  };
  const style = { '--tip-shift': `-${String(shift)}px`, '--tip-time': `${String(shift / SPEED / MOVING_SHARE)}s` } as CSSProperties;

  return (
    <button ref={box} type="button" className={s.tip} aria-label={`Совет: ${text} Следующий совет`} onClick={next}>
      <span key={text} ref={line} style={style} className={cx(s.tipText, moving && s.tipMoving, paused && s.tipPaused)}>
        {text}
      </span>
    </button>
  );
}
