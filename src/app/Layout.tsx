import type { CSSProperties } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import s from './Layout.module.css';
import { PixelIcon, type IconName } from '../ui';
import { MissedReminders } from '../features/notifications/MissedReminders';
import { fs } from '../ui/fs';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: IconName;
  accent: string;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Уровень дня', short: 'День', icon: 'calendar', accent: 'var(--c-task)' },
  { to: '/backlog', label: 'Инвентарь', short: 'Инвент.', icon: 'bag', accent: 'var(--c-backlog)' },
  { to: '/habits', label: 'Квесты', short: 'Квесты', icon: 'star', accent: 'var(--c-habit)' },
  { to: '/stats', label: 'Рекорды', short: 'Рекорды', icon: 'bars', accent: 'var(--c-xp)' },
  { to: '/settings', label: 'Настройки', short: 'Опции', icon: 'gear', accent: 'var(--c-text-dim)' },
];

const MOBILE = NAV.filter((n) => n.to !== '/settings');

function NavLinks({ items, short }: { items: NavItem[]; short?: boolean }) {
  return items.map((n) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.to === '/'}
      className={s.link}
      style={{ '--accent': n.accent } as CSSProperties}
    >
      <PixelIcon name={n.icon} size={short ? 24 : 16} />
      <span>{short ? n.short : n.label}</span>
    </NavLink>
  ));
}

export function Layout() {
  return (
    <div className={s.shell}>
      <a href="#main" className={`${s.link} ${s.skip}`}>
        К содержимому
      </a>
      <aside className={s.side}>
        <div className={s.logo}>
          PIXEL<span>▪</span>
          <br />
          PLANNER
        </div>
        <nav className={s.nav} aria-label="Основная навигация">
          <NavLinks items={NAV} />
        </nav>
        <div className={s.sideFooter} style={{ color: 'var(--c-text-muted)', fontSize: fs(16) }}>
          N — новая задача · ←/→ — дни
        </div>
      </aside>
      <header className={s.topbar}>
        <div className={s.logo}>
          PIXEL<span>▪</span>PLANNER
        </div>
        <Link to="/settings" aria-label="Настройки" style={{ color: 'var(--c-text-dim)', padding: 8, marginLeft: 'auto' }}>
          <PixelIcon name="gear" size={24} />
        </Link>
      </header>
      <main id="main" className={s.main}>
        <MissedReminders />
        <Outlet />
      </main>
      <nav className={s.bottom} aria-label="Нижняя навигация">
        <NavLinks items={MOBILE} short />
      </nav>
    </div>
  );
}
