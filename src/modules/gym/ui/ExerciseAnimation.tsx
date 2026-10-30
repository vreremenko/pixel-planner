/* Анимация упражнения: кадры по кругу. При «уменьшить движение» в системе — стоит, запуск кнопкой. */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Button } from '../../../core/ui';
import { ALPHA } from './alphabet';
import type { Anim } from './anims';

const FRAME_MS = 170;

function frameRects(anim: Anim, rows: readonly string[]): ReactElement[] {
  const out: ReactElement[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row.charAt(x);
      let w = 1;
      while (row.charAt(x + w) === ch) w++;
      if (ch !== '.') out.push(<rect key={`${String(x)}-${String(y)}`} x={x} y={y} width={w} height={1} fill={anim.PALETTE[ALPHA.indexOf(ch)]} />);
      x += w;
    }
  });
  return out;
}

export function ExerciseAnimation({ anim, label }: { anim: Anim; label: string }) {
  const frames = useMemo(() => anim.FRAMES.map((f) => frameRects(anim, f)), [anim]);
  const [reduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [playing, setPlaying] = useState(!reduced);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setI((v) => (v + 1) % frames.length), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, frames.length]);
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg viewBox={`0 0 ${String(anim.W)} ${String(anim.H)}`} width={anim.W * 3} height={anim.H * 3} shapeRendering="crispEdges" role="img" aria-label={label} style={{ width: 'min(80vw, 300px)', height: 'auto', display: 'block' }}>
        {frames[i]}
      </svg>
      <Button small icon={playing ? 'pause' : 'right'} onClick={() => setPlaying((v) => !v)} aria-pressed={playing}>
        {playing ? 'Пауза' : 'Показать'}
      </Button>
    </figure>
  );
}
