import { useEffect, type RefObject } from 'react';

/**
 * Высота закреплённой внизу панели → CSS-переменная --dock-h.
 * По ней резервируется место под последней задачей и поднимаются всплывающие сообщения.
 * При уходе с экрана переменная снимается.
 */
export function useDockHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--dock-h', `${String(Math.ceil(el.getBoundingClientRect().height))}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--dock-h');
    };
  }, [ref]);
}
