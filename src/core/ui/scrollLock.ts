/*
 * Блокировка прокрутки страницы под модальными окнами.
 * iOS Safari игнорирует overflow:hidden на body и продолжает крутить страницу под окном,
 * поэтому body «приклеивается» (position: fixed) со сдвигом на текущую прокрутку,
 * а при снятии блокировки позиция возвращается. Счётчик — для вложенных окон.
 */
let locks = 0;
let savedY = 0;

export function lockScroll(): void {
  locks++;
  if (locks > 1) return;
  savedY = window.scrollY;
  const b = document.body.style;
  b.position = 'fixed';
  b.top = `-${String(savedY)}px`;
  b.left = '0';
  b.right = '0';
  b.width = '100%';
}

export function unlockScroll(): void {
  if (locks === 0) return;
  locks--;
  if (locks > 0) return;
  const b = document.body.style;
  b.position = '';
  b.top = '';
  b.left = '';
  b.right = '';
  b.width = '';
  window.scrollTo(0, savedY);
}

export const isScrollLocked = (): boolean => locks > 0;
