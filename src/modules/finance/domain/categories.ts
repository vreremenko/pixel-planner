/*
 * Порядок категорий: его задаёт пользователь, и он одинаков везде — в окне операции, в настройках, у нейросети.
 * Пока порядок не меняли, стартовые идут как в DEFAULT_CATEGORIES, свои — за ними в порядке создания.
 */
import { DEFAULT_CATEGORIES, type Category, type CategoryKind } from './types';

const DEFAULT_RANK = new Map(DEFAULT_CATEGORIES.map((c, i) => [c.id, i]));

/** Ключ сортировки: ручной порядок, иначе место по умолчанию. */
function rank(c: Category): [number, number] {
  if (c.order !== undefined) return [c.order, 0];
  const d = DEFAULT_RANK.get(c.id);
  return d === undefined ? [1_000, c.createdAt] : [d, 0];
}

export function sortCategories<T extends Category>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const [x1, x2] = rank(a);
    const [y1, y2] = rank(b);
    return x1 - y1 || x2 - y2;
  });
}

/** Видимые категории одного вида по порядку (архивная остаётся, если она у редактируемой операции). */
export function visibleCategories(list: readonly Category[], kind: CategoryKind, keepId?: string): Category[] {
  return sortCategories(list.filter((c) => c.kind === kind && (!c.archived || c.id === keepId)));
}

/**
 * Сдвинуть категорию на `to`-ю позицию среди видимых того же вида. Возвращает категории с новым порядком
 * (всем видимым этого вида проставляется order, чтобы порядок стал явным и одинаковым на всех устройствах).
 */
export function moveCategory(list: readonly Category[], id: string, to: number): Category[] {
  const cur = list.find((c) => c.id === id);
  if (!cur) return [];
  const same = visibleCategories(list, cur.kind).filter((c) => c.id !== id);
  const at = Math.max(0, Math.min(same.length, to));
  same.splice(at, 0, cur);
  return same.flatMap((c, i) => (c.order === i ? [] : [{ ...c, order: i }]));
}

/** Порядок для новой категории — в конец своего вида. */
export function nextOrder(list: readonly Category[], kind: CategoryKind): number {
  return visibleCategories(list, kind).length;
}
