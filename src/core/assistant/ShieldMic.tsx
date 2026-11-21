/* Кнопка помощника — пиксельный «щит героя» с микрофоном: золото и неон. В покое тихо «дышит», при записи краснеет. */
import s from './Assistant.module.css';

export function ShieldIcon({ size = 56, recording = false }: { size?: number; recording?: boolean }) {
  const glyph = recording ? '#ff4d6d' : '#5ee6ff';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2 1h12v8h-1v2h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3V9H2z" fill={recording ? '#ff4d6d' : '#ffcc33'} />
      <path d="M3 2h10v7h-1v2h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3z" fill="#1d1a3a" />
      <rect x="7" y="3" width="2" height="5" fill={glyph} />
      <rect x="6" y="4" width="1" height="3" fill={glyph} />
      <rect x="9" y="4" width="1" height="3" fill={glyph} />
      <rect x="5" y="7" width="1" height="1" fill={glyph} />
      <rect x="10" y="7" width="1" height="1" fill={glyph} />
      <rect x="6" y="8" width="4" height="1" fill={glyph} />
      <rect x="7" y="9" width="2" height="2" fill={glyph} />
      <rect x="11" y="3" width="1" height="1" fill={recording ? '#fff' : '#ff4d6d'} />
    </svg>
  );
}

export function ShieldMic({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={s.shield} onClick={onClick} aria-label="Помощник: сказать или написать команду">
      <ShieldIcon />
    </button>
  );
}
