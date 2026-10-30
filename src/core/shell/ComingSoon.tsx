import { Panel, PixelIcon, type IconName } from '../ui';

/** Заглушка раздела в разработке (видна только в dev-сборке: такие разделы помечены status: 'draft'). */
export function ComingSoon({ title, icon, accent, children }: { title: string; icon: IconName; accent: string; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="glow" style={{ color: accent, marginBottom: 16 }}>
        {title}
      </h1>
      <Panel accent={accent}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', color: 'var(--c-text-dim)' }}>
          <PixelIcon name={icon} size={48} />
          <div>
            <p style={{ marginTop: 0, color: 'var(--c-text)' }}>Раздел в разработке.</p>
            {children}
          </div>
        </div>
      </Panel>
    </>
  );
}
