/* «Ещё» на телефоне: все разделы и настройки, которые не поместились в нижнее меню. */
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { PixelIcon } from '../ui';
import type { ModuleNavItem } from '../module';
import { SETTINGS, useModules } from './nav';
import s from './Shell.module.css';

function Tile({ n }: { n: ModuleNavItem }) {
  return (
    <Link to={n.to} className={s.tile} style={{ '--accent': n.accent } as CSSProperties}>
      <PixelIcon name={n.icon} size={24} />
      {n.label}
    </Link>
  );
}

export function MoreScreen() {
  const modules = useModules();
  return (
    <>
      <h1 className="glow" style={{ marginBottom: 8 }}>
        Все разделы
      </h1>
      {/* Раздел из нескольких экранов — своей группой; одноэкранные — вместе */}
      {modules
        .filter((m) => m.nav.length > 1)
        .map((m) => (
          <section key={m.id}>
            <h2 className={s.groupTitle}>{m.title}</h2>
            <div className={s.tiles}>
              {m.nav.map((n) => (
                <Tile key={n.to} n={n} />
              ))}
            </div>
          </section>
        ))}
      {modules.some((m) => m.nav.length === 1) && (
        <>
          <h2 className={s.groupTitle}>Разделы</h2>
          <div className={s.tiles}>
            {modules
              .filter((m) => m.nav.length === 1)
              .flatMap((m) => m.nav)
              .map((n) => (
                <Tile key={n.to} n={n} />
              ))}
          </div>
        </>
      )}
      <h2 className={s.groupTitle}>Приложение</h2>
      <div className={s.tiles}>
        <Tile n={SETTINGS} />
      </div>
    </>
  );
}
