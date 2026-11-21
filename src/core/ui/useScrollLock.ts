import { useEffect } from 'react';

/**
 * Пока открыта модальная шторка, страница под ней не прокручивается: иначе палец «промахивается» и листает фон.
 * Не через overflow: hidden — он сбрасывает прокрутку страницы, а на iPhone ещё и перестраивает панели Safari,
 * отчего нижнее меню подпрыгивает. Вместо этого гасим жесты прокрутки вне прокручиваемой части шторки
 * (элемент с атрибутом data-scroll-lock-allow). Счётчик — на случай двух шторок сразу.
 */
let locks = 0;

function scrollableInside(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target.closest('[data-scroll-lock-allow]') : null;
  return !!el && el.scrollHeight > el.clientHeight;
}

function onTouchMove(e: TouchEvent) {
  if (!scrollableInside(e.target)) e.preventDefault();
}

function onWheel(e: WheelEvent) {
  if (!scrollableInside(e.target)) e.preventDefault();
}

export function useScrollLock(): void {
  useEffect(() => {
    if (locks++ === 0) {
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('wheel', onWheel, { passive: false });
    }
    return () => {
      if (--locks === 0) {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('wheel', onWheel);
      }
    };
  }, []);
}
