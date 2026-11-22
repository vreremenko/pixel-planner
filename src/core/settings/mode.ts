/**
 * Оформление на <html>: режим «Для мамы» (data-mode) и пиксельный шрифт ретро-режима (data-font). Выбор запоминается,
 * чтобы следующий запуск сразу открылся как надо (см. скрипт в index.html). В режиме «Для мамы» шрифт всегда читаемый.
 */
const MODE_KEY = 'pp-mode';
const FONT_KEY = 'pp-font';
const THEME_COLOR = { normal: '#0b0a1a', mom: '#fbf1e8' } as const;

function remember(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // без localStorage оформление просто включится чуть позже, после чтения настроек
  }
}

export function applyMode(mom: boolean, retro = false): void {
  const root = document.documentElement;
  if (mom) root.dataset.mode = 'mom';
  else delete root.dataset.mode;
  if (retro && !mom) root.dataset.font = 'pixel';
  else delete root.dataset.font;
  root.style.background = ''; // убираем подложку, которую мог поставить скрипт в index.html
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mom ? THEME_COLOR.mom : THEME_COLOR.normal);
  remember(MODE_KEY, mom ? 'mom' : null);
  remember(FONT_KEY, retro ? 'pixel' : null);
}
