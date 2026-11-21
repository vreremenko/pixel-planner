/* Кнопка помощника — пиксельный «щит героя» с микрофоном: золото и неон (в режиме «Для мамы» — сердечко). В покое тихо «дышит»; при записи реагирует на голос. */
import { useSettings } from '../stores/settings';
import s from './Assistant.module.css';

/** Сердечко из пикселей: строки [y, от x, до x] — для режима «Для мамы». */
const HEART: readonly [number, number, number][] = [
  [1, 2, 5], [1, 10, 13], [2, 1, 6], [2, 9, 14], [3, 0, 15], [4, 0, 15], [5, 0, 15], [6, 0, 15], [7, 0, 15],
  [8, 1, 14], [9, 2, 13], [10, 3, 12], [11, 4, 11], [12, 5, 10], [13, 6, 9], [14, 7, 8],
];

/** Состояние щита: покой; голос звучит; тишина — ждёт нажатия. */
export type ShieldTone = 'idle' | 'live' | 'wait';

const HEART_FILL: Record<ShieldTone, string> = { idle: '#ff7aa8', live: '#ff3d7f', wait: '#ffb3cc' };

/** В режиме «Для мамы» — розовое сердечко с микрофоном вместо щита. */
function HeartIcon({ size, tone }: { size: number; tone: ShieldTone }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      {HEART.map(([y, a, b]) => (
        <rect key={`${String(y)}-${String(a)}`} x={a} y={y} width={b - a + 1} height={1} fill={HEART_FILL[tone]} />
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

/** Цвета щита: кромка, поле, микрофон. Говорите — неон, замолчали — золото «ждёт». */
const SHIELD: Record<ShieldTone, { rim: string; field: string; glyph: string }> = {
  idle: { rim: '#ffcc33', field: '#1d1a3a', glyph: '#5ee6ff' },
  live: { rim: '#5ee6ff', field: '#123447', glyph: '#ffffff' },
  wait: { rim: '#ffcc33', field: '#3a2a10', glyph: '#fff2b8' },
};

/** Щит без пустых полей вокруг: рисунок занимает всю высоту, ширина — 4/5 высоты. */
export function ShieldIcon({ size = 56, tone = 'idle' }: { size?: number; tone?: ShieldTone }) {
  const mom = useSettings((st) => st.settings.momMode);
  if (mom) return <HeartIcon size={size} tone={tone} />;
  const c = SHIELD[tone];
  return (
    <svg width={Math.round((size * 12) / 15)} height={size} viewBox="2 1 12 15" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2 1h12v8h-1v2h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3V9H2z" fill={c.rim} />
      <path d="M3 2h10v7h-1v2h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3z" fill={c.field} />
      {/* Микрофон: капсула, вокруг неё дужка с зазором, ножка и подставка — чтобы не читался как череп */}
      <rect x="7" y="3" width="2" height="1" fill={c.glyph} />
      <rect x="6" y="4" width="4" height="3" fill={c.glyph} />
      <rect x="7" y="7" width="2" height="1" fill={c.glyph} />
      <rect x="4" y="5" width="1" height="3" fill={c.glyph} />
      <rect x="11" y="5" width="1" height="3" fill={c.glyph} />
      <rect x="5" y="8" width="1" height="1" fill={c.glyph} />
      <rect x="10" y="8" width="1" height="1" fill={c.glyph} />
      <rect x="6" y="9" width="4" height="1" fill={c.glyph} />
      <rect x="7" y="10" width="2" height="1" fill={c.glyph} />
      <rect x="6" y="11" width="4" height="1" fill={c.glyph} />
    </svg>
  );
}

/** Кнопка-щит: в нижнем меню телефона и плавающая в углу на компьютере. */
export function ShieldMic({ onClick, floating = false }: { onClick: () => void; floating?: boolean }) {
  return (
    <button type="button" className={floating ? s.fab : s.shield} onClick={onClick} aria-label="Помощник">
      <ShieldIcon size={floating ? 64 : 72} />
    </button>
  );
}
