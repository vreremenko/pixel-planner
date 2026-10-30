import type { ChecklistItem } from './types';

export const MAX_CHECKLIST_ITEMS = 50;

/** Обрезает пробелы, убирает пустые пункты; пустой список → undefined (поле не храним). */
export function cleanChecklist(items: readonly ChecklistItem[] | undefined): ChecklistItem[] | undefined {
  const out = (items ?? [])
    .map((i) => ({ ...i, text: i.text.trim() }))
    .filter((i) => i.text !== '')
    .slice(0, MAX_CHECKLIST_ITEMS);
  return out.length > 0 ? out : undefined;
}

/** Шаблон для серии: отметки хранятся отдельно, по дням. */
export const stripDone = (items: readonly ChecklistItem[]): ChecklistItem[] => items.map((i) => ({ ...i, done: false }));

export const checkedIds = (items: readonly ChecklistItem[]): string[] => items.filter((i) => i.done).map((i) => i.id);

/** Шаблон серии + отмеченные в конкретный день пункты. */
export function withChecked(template: readonly ChecklistItem[], checked: readonly string[]): ChecklistItem[] {
  const set = new Set(checked);
  return template.map((i) => ({ ...i, done: set.has(i.id) }));
}

export function toggleItem(items: readonly ChecklistItem[], id: string): ChecklistItem[] {
  return items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
}

export function checklistProgress(items: readonly ChecklistItem[] | undefined): { done: number; total: number } {
  const list = items ?? [];
  return { done: list.filter((i) => i.done).length, total: list.length };
}
