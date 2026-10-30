import { Suspense, type CSSProperties } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import s from './Layout.module.css';
import { PixelIcon } from '../ui';
import type { ModuleNavItem } from '../module';
import { MODULES } from '../../modules';
import { MissedReminders } from '../notifications/MissedReminders';
import { fs } from '../ui/fs';

const NAV: ModuleNavItem[] = [
  ...MODULES.flatMap((m) => m.nav),
  { to: '/settings', label: 'Настройки', short: 'Опции', icon: 'gear', accent: 'var(--c-text-dim)' },
];

const MOBILE = NAV.filter((n) => n.to !== '/settings');

function NavLinks({ items, short }: { items: ModuleNavItem[]; short?: boolean }) {
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
        <Suspense fallback={<p style={{ color: 'var(--c-text-dim)' }}>Загрузка…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <nav className={s.bottom} aria-label="Нижняя навигация">
        <NavLinks items={MOBILE} short />
      </nav>
    </div>
  );
}
