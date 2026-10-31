import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';

/** Насколько нужно смахнуть влево (px), чтобы сработало удаление. */
const THRESHOLD = 96;
/** Дальше этого строка не едет. */
const MAX_PULL = 140;

/**
 * Смахивание строки влево пальцем: строка едет за пальцем, красная подложка под ней; дальше порога — onDelete,
 * и строка возвращается на место (само удаление подтверждает вызывающий). Мышь не участвует: на компьютере есть кнопки.
 * Вертикальная прокрутка не мешает — страница решает по направлению движения.
 */
export function useSwipeDelete(onDelete: (() => void) | undefined) {
  const [dx, setDx] = useState(0);
  const [active, setActive] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const locked = useRef(false);
  const swiped = useRef(false);

  const reset = () => {
    start.current = null;
    locked.current = false;
    setActive(false);
    setDx(0);
  };

  if (!onDelete) return { bind: {}, rowStyle: undefined, dx: 0, swiping: false, pastThreshold: false };

  const bind = {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      locked.current = false;
      swiped.current = false;
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (!locked.current) {
        if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) {
          reset();
          return;
        }
        if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my)) return;
        locked.current = true;
        setActive(true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      swiped.current = true;
      setDx(Math.max(-MAX_PULL, Math.min(0, mx)));
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const pulled = e.clientX - s.x;
      const fire = locked.current && pulled <= -THRESHOLD;
      reset();
      if (fire) onDelete();
    },
    onPointerCancel: reset,
    // Нажатие, которым закончилось смахивание, не должно открыть задачу
    onClickCapture: (e: React.MouseEvent) => {
      if (swiped.current) {
        e.stopPropagation();
        e.preventDefault();
        swiped.current = false;
      }
    },
  };

  const rowStyle: CSSProperties = { transform: `translateX(${String(dx)}px)`, transition: active ? 'none' : 'transform 0.15s steps(3)' };
  return { bind, rowStyle, dx, swiping: active, pastThreshold: dx <= -THRESHOLD };
}
