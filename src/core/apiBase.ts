/**
 * Адрес API сервера (`/api/…`). При сборке задаётся VITE_API_BASE (на GitHub Pages — адрес сервера из
 * переменной репозитория API_BASE); без неё запросы идут на тот же сайт, как в разработке (Vite проксирует /api).
 *
 * Запасной вход VITE_API_FALLBACK — посредник на Cloudflare. Сервер в России, и через часть VPN он не открывается вовсе;
 * тогда приложение само переходит на посредника, а время от времени проверяет, не открылся ли прямой путь.
 */
const base: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? import.meta.env.BASE_URL;
const fallback = import.meta.env.VITE_API_FALLBACK as string | undefined;

const PROBE_TIMEOUT_MS = 6_000;
/** Не проверять путь чаще, чем раз в минуту: при плохой сети иначе проверки шли бы на каждый запрос. */
const PROBE_GAP_MS = 60_000;

const root = (b: string) => new URL(b.endsWith('/') ? b : `${b}/`, self.location.href);
let viaFallback = false;
let probing: Promise<void> | null = null;
let lastProbe = 0;

export const apiUrl = (path: string): string => new URL(`api/${path}`, root(viaFallback && fallback ? fallback : base)).href;

/** Идут ли запросы через запасной вход (тогда синхронизация спрашивает сервер реже: у посредника лимит запросов). */
export const isViaFallback = (): boolean => viaFallback;

async function reachable(b: string): Promise<boolean> {
  try {
    const res = await fetch(new URL('api/config', root(b)), { cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Выбрать путь до сервера: прямой, если он открывается, иначе запасной. Зовут при запуске и после сбоя связи. */
export function checkRoute(): Promise<void> {
  if (!fallback) return Promise.resolve();
  if (probing) return probing;
  if (Date.now() - lastProbe < PROBE_GAP_MS) return Promise.resolve();
  lastProbe = Date.now();
  probing = (async () => {
    if (await reachable(base)) viaFallback = false;
    else if (await reachable(fallback)) viaFallback = true;
  })().finally(() => {
    probing = null;
  });
  return probing;
}
