import { useEffect } from 'react';

type Handler = (e: KeyboardEvent) => void;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Горячие клавиши; не срабатывают в полях ввода, при модификаторах и открытых модалках. */
export function useHotkeys(map: Record<string, Handler>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      // e.code — чтобы N работала и в русской раскладке (Т)
      const key = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key;
      const h = map[key];
      if (h) {
        e.preventDefault();
        h(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, enabled]);
}
