import type { CSSProperties } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import s from './Layout.module.css';
import { PixelIcon, type IconName } from '../ui';
import { useXpTotal } from '../data/hooks';
import { levelFromXp } from '../domain/xp';
import { ProgressBar } from '../charts/ProgressBar';
import { GameFx } from '../features/game/GameFx';
import { MissedReminders } from '../features/notifications/MissedReminders';

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
  { to: '/profile', label: 'Персонаж', short: 'Герой', icon: 'player', accent: 'var(--c-xp)' },
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

function LevelBox() {
  const lv = levelFromXp(useXpTotal());
  return (
    <Link to="/profile" className={s.levelBox} aria-label={`Уровень ${lv.level}, ${lv.into} из ${lv.span} XP`}>
      <div className={s.levelRow}>
        <span>LV {lv.level}</span>
        <span>
          {lv.into}/{lv.span}
        </span>
      </div>
      <ProgressBar value={lv.into / lv.span} label="Опыт до следующего уровня" segments={36} />
    </Link>
  );
}

export function Layout() {
  const lv = levelFromXp(useXpTotal());
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
        <LevelBox />
        <nav className={s.nav} aria-label="Основная навигация">
          <NavLinks items={NAV} />
        </nav>
        <div className={s.sideFooter} style={{ color: 'var(--c-text-muted)', fontSize: 16 }}>
          N — новая задача · ←/→ — дни
        </div>
      </aside>
      <header className={s.topbar}>
        <div className={s.logo}>
          PIXEL<span>▪</span>PLANNER
        </div>
        <Link to="/profile" className={s.levelMini} aria-label={`Уровень ${lv.level}`}>
          <PixelIcon name="star" size={16} /> LV{lv.level}
        </Link>
        <Link to="/settings" aria-label="Настройки" style={{ color: 'var(--c-text-dim)', padding: 8 }}>
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
      <GameFx />
    </div>
  );
}
