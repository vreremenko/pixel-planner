/*
 * Главный экран: «Начало работы» для новичка и два вида — «Сегодня» (список дня) и «Карточки» (по одной на раздел).
 * Выбранный вид запоминается на устройстве.
 */
import { Suspense, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Panel, PixelIcon, Segmented } from '../ui';
import { formatDateLong } from '../domain/dates';
import { useToday } from './useToday';
import { useModules } from './nav';
import s from './Shell.module.css';
import { GettingStarted } from '../onboarding/GettingStarted';
import { TodayScreen } from './TodayScreen';

type View = 'today' | 'cards';
const VIEW_KEY = 'pp-home-view';
const VIEWS: readonly { value: View; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'cards', label: 'Карточки' },
];

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'today';
  } catch {
    return 'today';
  }
}

function Cards() {
  const widgets = useModules().flatMap((m) => m.widgets ?? []);
  return (
    <div className={s.grid}>
      {widgets.map(({ id, title, icon, accent, to, Component }) => (
        <Panel
          key={id}
          title={title}
          icon={icon}
          accent={accent}
          actions={
            <Link to={to} className={s.cardLink} style={{ '--accent': accent } as CSSProperties} aria-label={`Открыть: ${title}`}>
              Открыть <PixelIcon name="right" size={16} />
            </Link>
          }
        >
          <Suspense fallback={<p style={{ color: 'var(--c-text-dim)', margin: 0 }}>Загрузка…</p>}>
            <Component />
          </Suspense>
        </Panel>
      ))}
    </div>
  );
}

export function Dashboard() {
  const todayDate = useToday();
  const [view, setView] = useState<View>(loadView);
  const pick = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // без памяти вид просто вернётся к «Сегодня» после перезагрузки
    }
  };
  return (
    <>
      <div className={s.head}>
        <h1 className="glow pageTitle">Сегодня</h1>
        <span className={s.date}>{formatDateLong(todayDate)}</span>
      </div>
      <div style={{ marginBottom: 'var(--gap-4)' }}>
        <GettingStarted />
      </div>
      <div style={{ marginBottom: 'var(--gap-3)' }}>
        <Segmented value={view} options={VIEWS} onChange={pick} label="Вид главного экрана" accent="var(--c-gold)" />
      </div>
      {view === 'today' ? <TodayScreen today={todayDate} /> : <Cards />}
    </>
  );
}
