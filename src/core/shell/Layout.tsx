import { Suspense, type CSSProperties } from 'react';
import { NavLink, Outlet } from 'react-router';
import s from './Layout.module.css';
import { PixelIcon } from '../ui';
import type { ModuleNavItem } from '../module';
import { MissedReminders } from '../notifications/MissedReminders';
import { useAuth } from '../auth/store';
import { HOME, SETTINGS, useMobileNav, useModules } from './nav';

function NavLinks({ items, short }: { items: readonly ModuleNavItem[]; short?: boolean }) {
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
  const modules = useModules();
  const mobile = useMobileNav();
  const signedIn = Boolean(useAuth((st) => st.session));
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
          <NavLinks items={[HOME]} />
          {modules.map((m) => (
            <div key={m.id} className={s.group}>
              {modules.length > 1 && <div className={s.groupTitle}>{m.title}</div>}
              <NavLinks items={m.nav} />
            </div>
          ))}
        </nav>
        <nav className={s.sideFooter} aria-label="Приложение">
          <NavLinks items={[SETTINGS]} />
        </nav>
      </aside>
      <header className={s.topbar}>
        <div className={s.logo}>
          PIXEL<span>▪</span>PLANNER
        </div>
        <NavLink to="/account" aria-label={signedIn ? 'Личный кабинет: вход выполнен' : 'Личный кабинет: войти'} className={s.account}>
          <PixelIcon name="user" size={24} />
          {signedIn && <span className={s.accountDot} aria-hidden="true" />}
        </NavLink>
      </header>
      <main id="main" className={s.main}>
        <MissedReminders />
        <Suspense fallback={<p style={{ color: 'var(--c-text-dim)' }}>Загрузка…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <nav className={s.bottom} aria-label="Нижняя навигация">
        <NavLinks items={mobile} short />
      </nav>
    </div>
  );
}
