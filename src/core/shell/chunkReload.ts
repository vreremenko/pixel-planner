/*
 * После выкладки старые куски приложения удаляются с сайта. Если приложение открыто давно (или Telegram отдал его
 * из кэша), переход в раздел просит уже несуществующий файл и падает «Importing a module script failed».
 * Лечится перезагрузкой: подтянется новая версия. Перезагружаем один раз, чтобы не уйти в бесконечный цикл.
 */
const KEY = 'pixel-planner:chunk-reload';
const LOOP_MS = 30_000;

export const isChunkError = (e: unknown): boolean =>
  e instanceof Error && /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS/i.test(e.message);

/** true — перезагрузка запущена. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < LOOP_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}
