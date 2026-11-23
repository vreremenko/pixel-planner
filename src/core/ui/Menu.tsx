import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import s from './ui.module.css';
import { Button } from './Button';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './icons';

export interface MenuItem {
  label: string;
  icon?: IconName;
  /** Пункт выбран сейчас (например, текущий порядок сортировки): помечается галочкой. */
  checked?: boolean;
  onSelect: () => void;
}

/** Кнопка «⋯» с выпадающим списком редких действий экрана. Закрывается выбором, Escape и нажатием мимо. */
export function Menu({ label, items, icon = 'menu', text }: { label: string; items: readonly MenuItem[]; icon?: IconName; text?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  // Список выровнен по правому краю кнопки; если кнопка стоит слева и список уходит за край экрана — выравниваем по левому
  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !el) return;
    if (el.getBoundingClientRect().left < 8) {
      el.style.left = '0';
      el.style.right = 'auto';
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div className={s.menu} ref={ref}>
      <Button variant="ghost" icon={icon} label={text === undefined ? label : undefined} aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {text}
      </Button>
      {open && (
        <ul className={s.menuList} id={id} role="menu" aria-label={label} ref={list}>
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={it.checked}
                className={s.menuItem}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.checked !== undefined ? (
                  <span aria-hidden="true" style={{ display: 'inline-flex', width: 16, height: 16, flexShrink: 0 }}>
                    {it.checked && <PixelIcon name="check" size={16} />}
                  </span>
                ) : (
                  it.icon && <PixelIcon name={it.icon} size={16} />
                )}
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
