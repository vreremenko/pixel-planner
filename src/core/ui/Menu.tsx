import { useEffect, useId, useRef, useState } from 'react';
import s from './ui.module.css';
import { Button } from './Button';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './icons';

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
}

/** Кнопка «⋯» с выпадающим списком редких действий экрана. Закрывается выбором, Escape и нажатием мимо. */
export function Menu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

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
      <Button variant="ghost" icon="menu" label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} />
      {open && (
        <ul className={s.menuList} id={id} role="menu" aria-label={label}>
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={s.menuItem}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.icon && <PixelIcon name={it.icon} size={16} />}
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
