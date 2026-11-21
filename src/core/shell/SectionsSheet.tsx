/*
 * «Разделы» на телефоне: крупные плитки модулей (3 в ряд) и строка «Кабинет · Настройки».
 * Подразделы (Программа, Замеры, Бэклог…) живут вкладками внутри своего раздела, поэтому плиток немного,
 * и новый модуль добавляет одну плитку, а не несколько пунктов меню.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { PixelIcon, useScrollLock } from '../ui';
import { ACCOUNT, ADMIN, SETTINGS, useIsAdmin, useModules } from './nav';
import s from './Layout.module.css';

export function SectionsSheet({ onClose }: { onClose: () => void }) {
  const modules = useModules();
  const admin = useIsAdmin();
  useScrollLock();
  const extra = admin ? [ACCOUNT, SETTINGS, ADMIN] : [ACCOUNT, SETTINGS];
  return (
    <div className={s.sheetBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <nav className={s.sheet} aria-label="Все разделы">
        <div className={s.sheetGrip} />
        <div className={s.sheetTitle}>Разделы</div>
        <div className={s.sheetTiles}>
          {modules.map((m) => {
            const to = m.nav[0]?.to ?? '/';
            return (
              <Link key={m.id} to={to} className={s.sheetTile} style={{ '--accent': m.accent } as CSSProperties} onClick={onClose}>
                <PixelIcon name={m.icon} size={28} />
                <span>{m.title}</span>
              </Link>
            );
          })}
        </div>
        <div className={s.sheetRow}>
          {extra.map((n) => (
            <Link key={n.to} to={n.to} className={s.sheetLink} style={{ '--accent': n.accent } as CSSProperties} onClick={onClose}>
              <PixelIcon name={n.icon} size={18} />
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
