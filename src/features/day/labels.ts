import type { Priority } from '../../domain/types';

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
export const PRIORITY_SHORT: Record<Priority, string> = { low: 'LO', medium: 'MID', high: 'HI' };
export const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'var(--c-prio-low)',
  medium: 'var(--c-prio-medium)',
  high: 'var(--c-prio-high)',
};
