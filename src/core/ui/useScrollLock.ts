import { useEffect } from 'react';

/**
 * Пока открыта модальная шторка, страница под ней не прокручивается: иначе палец «промахивается» и листает фон.
 * Счётчик — на случай двух шторок сразу.
 */
let locks = 0;
export function useScrollLock(): void {
  useEffect(() => {
    const root = document.documentElement;
    if (locks++ === 0) {
      root.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      root.style.overscrollBehavior = 'none';
    }
    return () => {
      if (--locks === 0) {
        root.style.overflow = '';
        document.body.style.overflow = '';
        root.style.overscrollBehavior = '';
      }
    };
  }, []);
}
