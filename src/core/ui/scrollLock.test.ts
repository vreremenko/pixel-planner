// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lockScroll, unlockScroll } from './scrollLock';

describe('блокировка прокрутки под окнами', () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    window.scrollTo = scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
    scrollTo.mockClear();
  });
  afterEach(() => {
    // Снять оставшиеся блокировки (лишние вызовы безопасны)
    for (let i = 0; i < 5; i++) unlockScroll();
  });

  it('приклеивает body со сдвигом и возвращает позицию', () => {
    lockScroll();
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-420px');
    unlockScroll();
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 420);
  });

  it('вложенные окна: страница отпускается только после закрытия последнего', () => {
    lockScroll();
    lockScroll();
    unlockScroll();
    expect(document.body.style.position).toBe('fixed');
    expect(scrollTo).not.toHaveBeenCalled();
    unlockScroll();
    expect(document.body.style.position).toBe('');
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('лишний unlock ничего не ломает', () => {
    unlockScroll();
    expect(document.body.style.position).toBe('');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
