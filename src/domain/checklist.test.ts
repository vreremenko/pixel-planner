import { describe, expect, it } from 'vitest';
import { checkedIds, checklistProgress, cleanChecklist, MAX_CHECKLIST_ITEMS, stripDone, toggleItem, withChecked } from './checklist';
import type { ChecklistItem } from './types';

const item = (id: string, text: string, done = false): ChecklistItem => ({ id, text, done });

describe('чек-лист', () => {
  it('cleanChecklist: обрезает, убирает пустые, пустой список → undefined', () => {
    expect(cleanChecklist([item('a', '  молоко '), item('b', '   '), item('c', 'хлеб', true)])).toEqual([
      item('a', 'молоко'),
      item('c', 'хлеб', true),
    ]);
    expect(cleanChecklist([item('a', ' ')])).toBeUndefined();
    expect(cleanChecklist(undefined)).toBeUndefined();
  });
  it('ограничивает число пунктов', () => {
    const many = Array.from({ length: MAX_CHECKLIST_ITEMS + 10 }, (_, i) => item(String(i), `п${String(i)}`));
    expect(cleanChecklist(many)).toHaveLength(MAX_CHECKLIST_ITEMS);
  });
  it('withChecked / stripDone / checkedIds', () => {
    const tpl = [item('a', 'А'), item('b', 'Б')];
    expect(withChecked(tpl, ['b']).map((i) => i.done)).toEqual([false, true]);
    expect(withChecked(tpl, ['zzz']).map((i) => i.done)).toEqual([false, false]);
    expect(stripDone([item('a', 'А', true)])[0]?.done).toBe(false);
    expect(checkedIds([item('a', 'А', true), item('b', 'Б')])).toEqual(['a']);
  });
  it('toggleItem не мутирует исходный список', () => {
    const list = [item('a', 'А'), item('b', 'Б')];
    const next = toggleItem(list, 'b');
    expect(next[1]?.done).toBe(true);
    expect(list[1]?.done).toBe(false);
  });
  it('прогресс', () => {
    expect(checklistProgress([item('a', 'А', true), item('b', 'Б')])).toEqual({ done: 1, total: 2 });
    expect(checklistProgress(undefined)).toEqual({ done: 0, total: 0 });
  });
});
