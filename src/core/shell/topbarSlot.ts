/* Место для кнопок экрана в верхней полосе телефона и признак узкого экрана. */
import { createContext, useSyncExternalStore } from 'react';

/** Контейнер в верхней полосе телефона; null — полосы нет (широкий экран) или она ещё не смонтирована. */
export const TopbarSlot = createContext<HTMLElement | null>(null);

/** Та же граница, что в Layout.module.css: уже — нижнее меню и верхняя полоса. */
const MOBILE_QUERY = '(max-width: 767px)';

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return () => undefined;
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

const isMobile = () => typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia(MOBILE_QUERY).matches;

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, isMobile, () => false);
}
