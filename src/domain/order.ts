/** Порядок между соседями (дробные ключи): переупорядочивание меняет только одну запись. */
export function orderBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return 0;
  if (prev === undefined) return (next ?? 0) - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

export function sortByOrder<T extends { order: number; time?: string | undefined }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order || (a.time ?? '99').localeCompare(b.time ?? '99'));
}
