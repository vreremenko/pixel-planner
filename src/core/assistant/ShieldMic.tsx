/* Кнопка помощника — пиксельный «щит героя» с черепом-терминатором: золото и хром (в режиме «Для мамы» — сердечко). В покое тихо «дышит»; при записи реагирует на голос. */
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

/** Цвета щита: кромка, поле и краски черепа. Говорите — неон, замолчали — золото «ждёт». */
type Ink = 'L' | 'M' | 'D' | 'R' | 'Y';
const SHIELD: Record<ShieldTone, { rim: string; field: string } & Record<Ink, string>> = {
  idle: { rim: '#ffcc33', field: '#1d1a3a', L: '#e4ebf5', M: '#8f9cb3', D: '#0b0a1a', R: '#ff2a2a', Y: '#ffd6d6' },
  live: { rim: '#5ee6ff', field: '#123447', L: '#ffffff', M: '#a9def5', D: '#041821', R: '#ff1a1a', Y: '#ffffff' },
  wait: { rim: '#ffcc33', field: '#3a2a10', L: '#fff2b8', M: '#d4a23a', D: '#201404', R: '#ff3b3b', Y: '#ffe2e2' },
};

/** Череп киборга 16×18: L — хром, M — тень, D — глазницы и щели, R/Y — горящие линзы. */
const SKULL = [
  '.....LLLLLL.....',
  '...LLLLLLLLLL...',
  '..LLLLLMMLLLLL..',
  '.LLLLLLMMLLLLLM.',
  '.LLLLLLLLLLLLLM.',
  'LLLLLLLLLLLLLLMM',
  'LMMMMMLLLLMMMMMM',
  'LDDDDDMLLMDDDDDM',
  'LDDRRDDLLDDRRDDM',
  'LDRYYRDLLDRYYRDM',
  'LDDRRDDLLDDRRDDM',
  'MLDDDDLMMLDDDDLM',
  '.MLLLLDDDDLLLLM.',
  '.MMLLLLDDLLLLMM.',
  '..MLDLDLLDLDLM..',
  '..MLDLDLLDLDLM..',
  '...MLLLLLLLLM...',
  '....MMMMMMMM....',
];

/** Строки черепа → отрезки одного цвета [y, x, ширина, цвет]: меньше прямоугольников в SVG. */
const SKULL_RUNS: readonly [number, number, number, Ink][] = SKULL.flatMap((row, y) => {
  const runs: [number, number, number, Ink][] = [];
  for (let x = 0; x < row.length; ) {
    const k = row[x];
    let w = 1;
    while (row[x + w] === k) w++;
    if (k && k !== '.') runs.push([y, x, w, k as Ink]);
    x += w;
  }
  return runs;
});

/** Щит без пустых полей вокруг: рисунок занимает всю высоту, ширина — 4/5 высоты. */
export function ShieldIcon({ size = 56, tone = 'idle' }: { size?: number; tone?: ShieldTone }) {
  const mom = useSettings((st) => st.settings.momMode);
  if (mom) return <HeartIcon size={size} tone={tone} />;
  const c = SHIELD[tone];
  return (
    <svg width={Math.round((size * 12) / 15)} height={size} viewBox="2 1 12 15" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2 1h12v8h-1v2h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3V9H2z" fill={c.rim} />
      <path d="M3 2h10v7h-1v2h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3z" fill={c.field} />
      {/* Череп киборга вдвое мельче пикселей щита: хром, тень, глазницы с красными «линзами» */}
      <g transform="translate(4 2.5) scale(0.5)">
        {SKULL_RUNS.map(([y, x, w, k]) => (
          <rect key={`${String(y)}-${String(x)}`} x={x} y={y} width={w} height={1} fill={c[k]} />
        ))}
      </g>
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
