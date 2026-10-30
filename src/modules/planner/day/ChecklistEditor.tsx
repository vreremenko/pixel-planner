import { useEffect, useRef } from 'react';
import s from './Day.module.css';
import { Button, Checkbox, inputClass } from '../../../core/ui';
import { MAX_CHECKLIST_ITEMS } from '../domain/checklist';
import type { ChecklistItem } from '../domain/types';

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

const newItem = (): ChecklistItem => ({ id: crypto.randomUUID(), text: '', done: false });

/** Редактор пунктов: Enter — новый пункт ниже, Backspace в пустом — удалить пункт. */
export function ChecklistEditor({ items, onChange }: Props) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusNext = useRef<string | null>(null);

  // После добавления/удаления пункта переносим фокус на нужное поле
  useEffect(() => {
    if (focusNext.current) {
      inputs.current.get(focusNext.current)?.focus();
      focusNext.current = null;
    }
  });

  const update = (id: string, patch: Partial<ChecklistItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addAfter = (index: number) => {
    if (items.length >= MAX_CHECKLIST_ITEMS) return;
    const item = newItem();
    focusNext.current = item.id;
    onChange([...items.slice(0, index + 1), item, ...items.slice(index + 1)]);
  };

  const remove = (index: number) => {
    const prev = items[index - 1] ?? items[index + 1];
    if (prev) focusNext.current = prev.id;
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <fieldset className={s.clBox}>
      <legend className={s.clLegend}>ЧЕК-ЛИСТ</legend>
      {items.map((item, index) => (
        <div key={item.id} className={s.clRow}>
          <Checkbox checked={item.done} onChange={(done) => update(item.id, { done })} label={`Пункт выполнен: ${item.text || String(index + 1)}`} color="var(--c-task)" />
          <input
            ref={(el) => {
              if (el) inputs.current.set(item.id, el);
              else inputs.current.delete(item.id);
            }}
            className={inputClass}
            style={{ flex: 1, minWidth: 0 }}
            value={item.text}
            maxLength={200}
            placeholder="Что нужно сделать"
            aria-label={`Пункт ${String(index + 1)}`}
            onChange={(e) => update(item.id, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // Enter не должен отправлять всю форму
                e.preventDefault();
                if (item.text.trim() !== '') addAfter(index);
              } else if (e.key === 'Backspace' && item.text === '' && items.length > 1) {
                e.preventDefault();
                remove(index);
              }
            }}
          />
          <Button small variant="ghost" icon="close" label={`Удалить пункт ${String(index + 1)}`} onClick={() => remove(index)} />
        </div>
      ))}
      <Button small icon="plus" disabled={items.length >= MAX_CHECKLIST_ITEMS} onClick={() => addAfter(items.length - 1)}>
        Пункт
      </Button>
    </fieldset>
  );
}
