/* Кнопка помощника — пиксельный «щит героя» с микрофоном: золото и неон (в режиме «Для мамы» — сердечко). В покое тихо «дышит», при записи краснеет. */
import { useSettings } from '../stores/settings';
import s from './Assistant.module.css';

/** Сердечко из пикселей: строки [y, от x, до x] — для режима «Для мамы». */
const HEART: readonly [number, number, number][] = [
  [1, 2, 5], [1, 10, 13], [2, 1, 6], [2, 9, 14], [3, 0, 15], [4, 0, 15], [5, 0, 15], [6, 0, 15], [7, 0, 15],
  [8, 1, 14], [9, 2, 13], [10, 3, 12], [11, 4, 11], [12, 5, 10], [13, 6, 9], [14, 7, 8],
];

/** В режиме «Для мамы» — розовое сердечко с микрофоном вместо щита. */
function HeartIcon({ size, recording }: { size: number; recording: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      {HEART.map(([y, a, b]) => (
        <rect key={`${String(y)}-${String(a)}`} x={a} y={y} width={b - a + 1} height={1} fill={recording ? '#ff3d7f' : '#ff7aa8'} />
      ))}
      <rect x="2" y="2" width="2" height="1" fill="#ffd1e1" />
      <rect x="1" y="3" width="1" height="2" fill="#ffd1e1" />
      <rect x="7" y="4" width="2" height="4" fill="#fff" />
      <rect x="6" y="5" width="1" height="2" fill="#fff" />
      <rect x="9" y="5" width="1" height="2" fill="#fff" />
      <rect x="5" y="7" width="1" height="1" fill="#fff" />
      <rect x="10" y="7" width="1" height="1" fill="#fff" />
      <rect x="6" y="8" width="4" height="1" fill="#fff" />
      <rect x="7" y="9" width="2" height="2" fill="#fff" />
    </svg>
  );
}

export function ShieldIcon({ size = 56, recording = false }: { size?: number; recording?: boolean }) {
  const mom = useSettings((st) => st.settings.momMode);
  if (mom) return <HeartIcon size={size} recording={recording} />;
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
      <ShieldIcon size={52} />
    </button>
  );
}
