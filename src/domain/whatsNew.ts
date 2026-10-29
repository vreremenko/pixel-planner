import type { ChangelogEntry } from '../changelog';

/** Сравнение версий вида 1.2.3 (по числам: 0.10.0 новее 0.9.0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export const MAX_SHOWN = 5;

/**
 * Какие записи показать в окне «Что нового».
 * entries — от новых к старым; lastSeen — версия, патч-ноуты которой пользователь уже видел.
 *  - уже видел последнюю версию → ничего;
 *  - не видел ничего (lastSeen нет): новичку не показываем (он сам всё видит впервые),
 *    а тому, у кого уже есть данные (обновился с версии без этого окна), — только последнюю запись;
 *  - иначе — все пропущенные версии (но не больше MAX_SHOWN), от новых к старым.
 */
export function entriesToShow(
  entries: readonly ChangelogEntry[],
  lastSeen: string | undefined,
  existingUser: boolean,
): ChangelogEntry[] {
  const latest = entries[0];
  if (!latest) return [];
  if (lastSeen === undefined) return existingUser ? [latest] : [];
  const missed = entries.filter((e) => compareVersions(e.version, lastSeen) > 0);
  return missed.slice(0, MAX_SHOWN);
}
