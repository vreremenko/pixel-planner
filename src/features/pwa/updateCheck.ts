/*
 * Мгновенное обновление: при запуске и при возврате в приложение сверяем номер сборки
 * с version.json на сервере и, если вышла новая версия, перезагружаем страницу.
 * Без этого iOS «возобновляет» старое приложение, и новая версия появляется лишь со 2–3 запуска.
 */
const KEY = 'pp-reload-for';
const CHECK_MIN_GAP_MS = 5_000;

/** Нужна ли перезагрузка. lastTried — сборка, ради которой мы уже перезагружались: защита от цикла, если сервер отдаёт старое. */
export function needsReload(local: string, remote: string | null, lastTried: string | null): boolean {
  return remote !== null && remote !== local && remote !== lastTried;
}

async function fetchRemoteBuild(): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${String(Date.now())}`, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return null;
    const b = ((await res.json()) as { build?: unknown }).build;
    return typeof b === 'string' ? b : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Пользователь печатает или открыто окно — не перезагружаем, чтобы не потерять ввод. */
function busy(): boolean {
  const a = document.activeElement;
  const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a instanceof HTMLElement && a.isContentEditable);
  return typing || document.querySelector('dialog[open]') !== null;
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let last = 0;
let retry: ReturnType<typeof setTimeout> | undefined;

export async function checkForUpdate(): Promise<void> {
  if (import.meta.env.DEV) return;
  const now = Date.now();
  if (now - last < CHECK_MIN_GAP_MS) return;
  last = now;
  const remote = await fetchRemoteBuild();
  if (!needsReload(__BUILD_ID__, remote, read()) || remote === null) return;
  if (busy()) {
    clearTimeout(retry);
    retry = setTimeout(() => void checkForUpdate(), 10_000);
    return;
  }
  try {
    localStorage.setItem(KEY, remote);
  } catch {
    // без localStorage защиты от цикла нет — лучше не перезагружаться
    return;
  }
  // Пусть service worker скачает новую версию заранее; но дольше пары секунд не ждём
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  await Promise.race([reg?.update().catch(() => undefined), new Promise((r) => setTimeout(r, 2_500))]);
  location.reload();
}

export function startUpdateChecks(): void {
  const run = () => void checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  window.addEventListener('pageshow', run);
  window.addEventListener('focus', run);
  setInterval(() => {
    if (document.visibilityState === 'visible') run();
  }, 300_000);
  run();
}
