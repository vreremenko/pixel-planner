/*
 * Порядок задач дня: «Вручную» — как расставили перетаскиванием, «По времени» — ближайшее сверху,
 * «По важности», «Сначала несделанные». Одинаково для экрана «День» и карточки «Сегодня» на сводке.
 */
export type DaySort = 'time' | 'manual' | 'priority' | 'pending';

/**
 * Пункты меню сортировки. «Вручную» в меню нет: оно включается само, когда задачу перетащили, —
 * тогда ни один пункт не отмечен; выбрали пункт — список снова отсортирован.
 */
export const DAY_SORTS: { value: Exclude<DaySort, 'manual'>; label: string }[] = [
  { value: 'time', label: 'По времени' },
  { value: 'pending', label: 'Сначала несделанные' },
  { value: 'priority', label: 'По важности' },
];

/** Подпись текущего порядка (для кнопки на сводке). */
export const sortLabel = (mode: DaySort): string => DAY_SORTS.find((o) => o.value === mode)?.label ?? 'Свой порядок';

export const isDaySort = (v: unknown): v is DaySort => DAY_SORTS.some((s) => s.value === v);

/** Что нужно знать о задаче (или экземпляре повторяющейся), чтобы её расставить. */
export interface Sortable {
  time?: string | undefined;
  order: number;
  priority: 'low' | 'medium' | 'high';
  done: boolean;
}

const WEIGHT = { high: 0, medium: 1, low: 2 } as const;
/** Задачи без времени уходят в конец. */
const timeKey = (s: Sortable) => s.time ?? '99:99';

const byTime = (a: Sortable, b: Sortable) => timeKey(a).localeCompare(timeKey(b)) || a.order - b.order;

export function sortDay<T>(items: readonly T[], mode: DaySort, view: (item: T) => Sortable): T[] {
  const compare = (a: T, b: T): number => {
    const x = view(a);
    const y = view(b);
    switch (mode) {
      case 'manual':
        return x.order - y.order || timeKey(x).localeCompare(timeKey(y));
      case 'priority':
        return WEIGHT[x.priority] - WEIGHT[y.priority] || byTime(x, y);
      case 'pending':
        return Number(x.done) - Number(y.done) || byTime(x, y);
      case 'time':
        return byTime(x, y);
    }
  };
  return [...items].sort(compare);
}
