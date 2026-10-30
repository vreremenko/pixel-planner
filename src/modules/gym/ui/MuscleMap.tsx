/* Инфографика упражнения: пиксельный атлет, работающие мышцы подсвечены; кнопка поворачивает его спиной. */
import { useMemo, useState, type ReactElement } from 'react';
import { Button } from '../../../core/ui';
import type { MuscleId } from '../domain/muscles';
import { BACK, FRONT, PALETTE, PALETTE_KEYS, SPRITE_H, SPRITE_W } from './athleteSprite';
import { BACK_GRID, BACK_ONLY, COLORS, FRONT_GRID, PRIMARY, SECONDARY, tint } from './muscleGrid';

function Figure({ rows, grid, label, primary, secondary }: { rows: readonly string[]; grid: (MuscleId | undefined)[][]; label: string; primary: ReadonlySet<MuscleId>; secondary: ReadonlySet<MuscleId> }) {
  const rects = useMemo(() => {
    const out: ReactElement[] = [];
    rows.forEach((row, y) => {
      let x = 0;
      const colorAt = (i: number): string | null => {
        const ch = row[i] ?? '.';
        if (ch === '.') return null;
        const c = COLORS[PALETTE_KEYS.indexOf(ch)];
        if (!c) return null;
        const m = grid[y]?.[i];
        if (m && primary.has(m)) return tint(c, PRIMARY);
        if (m && secondary.has(m)) return tint(c, SECONDARY);
        return PALETTE[PALETTE_KEYS.indexOf(ch)] ?? null;
      };
      while (x < row.length) {
        const fill = colorAt(x);
        let w = 1;
        while (x + w < row.length && colorAt(x + w) === fill) w++;
        if (fill) out.push(<rect key={`${String(x)}-${String(y)}`} x={x} y={y} width={w} height={1} fill={fill} />);
        x += w;
      }
    });
    return out;
  }, [rows, grid, primary, secondary]);
  return (
    <svg viewBox={`0 0 ${String(SPRITE_W)} ${String(SPRITE_H)}`} width={SPRITE_W * 3} height={SPRITE_H * 3} shapeRendering="crispEdges" role="img" aria-label={label} style={{ width: 'min(38vw, 192px)', height: 'auto', display: 'block' }}>
      {rects}
    </svg>
  );
}

export function MuscleMap({ primary, secondary = [] }: { primary: readonly MuscleId[]; secondary?: readonly MuscleId[] }) {
  const p = useMemo(() => new Set(primary), [primary]);
  const s = useMemo(() => new Set(secondary), [secondary]);
  // Сразу показываем ту сторону, где работают основные мышцы
  const [back, setBack] = useState(primary.length > 0 && primary.every((m) => BACK_ONLY.has(m) || (m === 'lats' || m === 'traps' || m === 'triceps')) && !primary.some((m) => m === 'chest'));
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <Figure rows={back ? BACK : FRONT} grid={back ? BACK_GRID : FRONT_GRID} label={back ? 'Вид сзади' : 'Вид спереди'} primary={p} secondary={s} />
      <Button small icon="repeat" onClick={() => setBack((v) => !v)} aria-pressed={back}>
        {back ? 'Сзади' : 'Спереди'}
      </Button>
    </figure>
  );
}

