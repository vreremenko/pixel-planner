import { Suspense, useMemo, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import s from './Layout.module.css';
import { PixelIcon } from '../ui';
import type { ModuleNavItem } from '../module';
import { MissedReminders } from '../notifications/MissedReminders';
import { useAuth } from '../auth/store';
import { TopbarSlot } from './topbarSlot';
import { ACCOUNT, HOME, MORE, SETTINGS, useMobileNav, useModules } from './nav';

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

/** Пункт меню, к которому относится адрес: самый длинный подходящий путь («/gym/workout/1» → «/gym»). */
function useCurrentItem(items: readonly ModuleNavItem[]): ModuleNavItem | undefined {
  const { pathname } = useLocation();
  return useMemo(() => {
    let best: ModuleNavItem | undefined;
    for (const n of items) {
      const hit = n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(`${n.to}/`);
      if (hit && (!best || n.to.length > best.to.length)) best = n;
    }
    return best;
  }, [items, pathname]);
}

export function Layout() {
  const modules = useModules();
  const mobile = useMobileNav();
  const signedIn = Boolean(useAuth((st) => st.session));
  const allItems = useMemo(() => [HOME, ...modules.flatMap((m) => m.nav), ACCOUNT, SETTINGS, MORE], [modules]);
  const current = useCurrentItem(allItems);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
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
          <NavLinks items={[ACCOUNT, SETTINGS]} />
        </nav>
      </aside>
      <header className={s.topbar}>
        {/* На телефоне вместо логотипа — название экрана; заголовок страницы при этом прячется (класс pageTitle) */}
        {current ? (
          <div className={s.screenTitle} style={{ color: current.accent }}>
            {current.label}
          </div>
        ) : (
          <div className={s.logo}>
            PIXEL<span>▪</span>PLANNER
          </div>
        )}
        <div className={s.topActions} ref={setSlot} />
        <NavLink to="/account" aria-label={signedIn ? 'Личный кабинет: вход выполнен' : 'Личный кабинет: войти'} className={s.account} data-signed-in={signedIn}>
          <PixelIcon name="user" size={24} />
        </NavLink>
      </header>
      <main id="main" className={s.main}>
        <MissedReminders />
        <TopbarSlot.Provider value={slot}>
          <Suspense fallback={<p style={{ color: 'var(--c-text-dim)' }}>Загрузка…</p>}>
            <Outlet />
          </Suspense>
        </TopbarSlot.Provider>
      </main>
      <nav className={s.bottom} aria-label="Нижняя навигация">
        <NavLinks items={mobile} short />
      </nav>
    </div>
  );
}
