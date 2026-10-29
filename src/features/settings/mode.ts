/** Режим «Для мамы»: ставит тему на <html> и запоминает выбор, чтобы следующий запуск открылся сразу в нужной теме. */
export const MODE_KEY = 'pp-mode';
const THEME_COLOR = { normal: '#0b0a1a', mom: '#fbf1e8' } as const;

export function applyMode(mom: boolean): void {
  const root = document.documentElement;
  if (mom) root.dataset.mode = 'mom';
  else delete root.dataset.mode;
  root.style.background = ''; // убираем подложку, которую мог поставить скрипт в index.html
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mom ? THEME_COLOR.mom : THEME_COLOR.normal);
  try {
    if (mom) localStorage.setItem(MODE_KEY, 'mom');
    else localStorage.removeItem(MODE_KEY);
  } catch {
    // без localStorage тема просто включится чуть позже, после чтения настроек
  }
}
