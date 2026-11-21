import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import s from './Layout.module.css';
import { PixelIcon } from '../ui';
import type { ModuleNavItem } from '../module';
import { MissedReminders } from '../notifications/MissedReminders';
import { useAuth } from '../auth/store';
import { TopbarSlot } from './topbarSlot';
import { Goida } from '../easter/Goida';
import { OfflineBar } from './OfflineBar';
import { TelegramBridge } from '../telegram/TelegramBridge';
import { TelegramWelcome } from '../telegram/TelegramWelcome';
import { ACCOUNT, ADMIN, HOME, MORE, SETTINGS, useIsAdmin, useMobileNav, useModules } from './nav';
import { SectionsSheet } from './SectionsSheet';
import { ShieldMic } from '../assistant/ShieldMic';
import { VoiceSheet } from '../assistant/VoiceSheet';
import { ChatPanel } from '../assistant/ChatPanel';

/**
 * Пункты меню. Подсвечен ровно один — тот, к которому относится адрес (самый длинный подходящий путь):
 * иначе «/gym» горел бы вместе с «/gym/programs».
 */
function NavLinks({ items, short, current }: { items: readonly ModuleNavItem[]; short?: boolean; current: ModuleNavItem | undefined }) {
  return items.map((n) => (
    <Link
      key={n.to}
      to={n.to}
      aria-current={current?.to === n.to ? 'page' : undefined}
      className={s.link}
      style={{ '--accent': n.accent } as CSSProperties}
    >
      <PixelIcon name={n.icon} size={short ? 24 : 16} />
      <span>{short ? n.short : n.label}</span>
    </Link>
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
  const admin = useIsAdmin();
  const allItems = useMemo(() => [HOME, ...modules.flatMap((m) => m.nav), ACCOUNT, ADMIN, SETTINGS, MORE], [modules]);
  const current = useCurrentItem(allItems);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const { pathname } = useLocation();
  // Шторка помнит экран, на котором открыта: перешли на другой — она закрывается сама
  const [opened, setOpened] = useState<{ kind: 'sections' | 'voice'; path: string } | null>(null);
  const sheet = opened?.path === pathname ? opened.kind : null;
  const setSheet = (kind: 'sections' | 'voice' | null) => setOpened(kind ? { kind, path: pathname } : null);
  // Чат помощника на компьютере не закрывается при переходах: в нём пишут, глядя на нужный экран
  const [chat, setChat] = useState(false);
  const closeChat = useCallback(() => setChat(false), []);
  // Раздел из нескольких экранов: на телефоне его экраны — вкладками наверху, а не пунктами меню
  const tabsOf = modules.find((m) => m.nav.length > 1 && current && m.nav.includes(current));
  // Новый экран открывается с начала, а не с места, где листали прошлый
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
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
          <NavLinks items={[HOME]} current={current} />
          {modules.map((m) => (
            <div key={m.id} className={s.group}>
              {modules.length > 1 && <div className={s.groupTitle}>{m.title}</div>}
              <NavLinks items={m.nav} current={current} />
            </div>
          ))}
        </nav>
        <nav className={s.sideFooter} aria-label="Приложение">
          <NavLinks items={admin ? [ACCOUNT, ADMIN, SETTINGS] : [ACCOUNT, SETTINGS]} current={current} />
        </nav>
      </aside>
      <header className={s.topbar}>
        <div className={s.topRow}>
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
        </div>
        <OfflineBar className={s.offlineMobile} />
        {tabsOf && (
          <nav className={s.moduleTabs} aria-label={`Экраны раздела «${tabsOf.title}»`}>
            {tabsOf.nav.map((n) => (
              <Link key={n.to} to={n.to} aria-current={current?.to === n.to ? 'page' : undefined} className={s.moduleTab} style={{ '--accent': n.accent } as CSSProperties}>
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <Goida />
      <TelegramBridge />
      <TelegramWelcome />
      <main id="main" className={s.main}>
        <OfflineBar className={s.offlineDesktop} />
        <MissedReminders />
        <TopbarSlot.Provider value={slot}>
          <Suspense fallback={<p style={{ color: 'var(--c-text-dim)' }}>Загрузка…</p>}>
            <Outlet />
          </Suspense>
        </TopbarSlot.Provider>
      </main>
      <nav className={s.bottom} aria-label="Нижняя навигация">
        <NavLinks items={mobile.slice(0, 2)} short current={current} />
        <ShieldMic onClick={() => setSheet('voice')} />
        <NavLinks items={mobile.slice(2)} short current={current} />
        <button type="button" className={s.link} aria-expanded={sheet === 'sections'} onClick={() => setSheet(sheet === 'sections' ? null : 'sections')} style={{ '--accent': MORE.accent } as CSSProperties}>
          <PixelIcon name="menu" size={24} />
          <span>Разделы</span>
        </button>
      </nav>
      {sheet === 'sections' && <SectionsSheet onClose={() => setSheet(null)} />}
      {sheet === 'voice' && <VoiceSheet onClose={() => setSheet(null)} />}
      {chat ? <ChatPanel onClose={closeChat} /> : <ShieldMic floating onClick={() => setChat(true)} />}
    </div>
  );
}
