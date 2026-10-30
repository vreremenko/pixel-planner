/* Главный экран: карточки включённых разделов, из них проваливаемся в разделы. */
import { Suspense, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Panel, PixelIcon } from '../ui';
import { formatDateLong } from '../domain/dates';
import { useToday } from './useToday';
import { useModules } from './nav';
import s from './Shell.module.css';

export function Dashboard() {
  const todayDate = useToday();
  const widgets = useModules().flatMap((m) => m.widgets ?? []);
  return (
    <>
      <div className={s.head}>
        <h1 className="glow pageTitle">Сводка</h1>
        <span className={s.date}>{formatDateLong(todayDate)}</span>
      </div>
      {widgets.length === 0 ? (
        <p style={{ color: 'var(--c-text-dim)' }}>Все разделы выключены. Включите нужные в настройках.</p>
      ) : (
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
      )}
    </>
  );
}
