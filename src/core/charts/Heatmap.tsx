import { useState } from 'react';
import { addDays, formatDateShort, parseLocalDate, startOfWeek, MONTHS, WEEKDAYS_SHORT } from '../domain/dates';
import { heatLevel } from './heat';
import type { LocalDate } from '../domain/types';
import { fs } from '../ui/fs';

interface Props {
  values: ReadonlyMap<LocalDate, number>;
  end: LocalDate;
  weeks?: number;
  title: string;
}

const C = 14; // клетка
const G = 3; // зазор

/** Тепловая карта активности: колонки — недели, строки — дни недели (Пн сверху). */
export function Heatmap({ values, end, weeks = 20, title }: Props) {
  const [hover, setHover] = useState<{ d: LocalDate; n: number; x: number; y: number } | null>(null);
  const start = addDays(startOfWeek(end), -(weeks - 1) * 7);
  const max = Math.max(1, ...values.values());
  const left = 26;
  const top = 16;
  const width = left + weeks * (C + G);
  const height = top + 7 * (C + G);

  const cells = [];
  let lastMonth = -1;
  const monthLabels = [];
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(start, w * 7);
    const { m } = parseLocalDate(weekStart);
    if (m !== lastMonth) {
      monthLabels.push(
        <text key={`m${w}`} x={left + w * (C + G)} y={10} fill="var(--c-text-muted)" fontFamily="var(--font-body)" fontSize="13">
          {MONTHS[m - 1]?.slice(0, 3)}
        </text>,
      );
      lastMonth = m;
    }
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);
      if (date > end) continue;
      const n = values.get(date) ?? 0;
      const x = left + w * (C + G);
      const y = top + d * (C + G);
      cells.push(
        <rect
          key={date}
          x={x}
          y={y}
          width={C}
          height={C}
          fill={`var(--c-heat-${heatLevel(n, max)})`}
          stroke={hover?.d === date ? 'var(--c-xp)' : 'none'}
          strokeWidth={2}
          onMouseEnter={() => setHover({ d: date, n, x, y })}
          onMouseLeave={() => setHover(null)}
        >
          <title>{`${formatDateShort(date)}: ${n}`}</title>
        </rect>,
      );
    }
  }

  return (
    <figure style={{ margin: 0, overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 360, maxWidth: width * 2, display: 'block' }} shapeRendering="crispEdges" role="img" aria-label={title}>
        {monthLabels}
        {[0, 2, 4].map((d) => (
          <text key={d} x={0} y={top + d * (C + G) + 11} fill="var(--c-text-muted)" fontFamily="var(--font-body)" fontSize="12">
            {WEEKDAYS_SHORT[d]}
          </text>
        ))}
        {cells}
        {hover && (
          <g pointerEvents="none">
            <rect x={Math.min(hover.x - 20, width - 92)} y={Math.max(0, hover.y - 26)} width={90} height={22} fill="var(--c-bg)" stroke="var(--c-xp)" strokeWidth={2} />
            <text x={Math.min(hover.x - 20, width - 92) + 45} y={Math.max(0, hover.y - 26) + 16} textAnchor="middle" fill="var(--c-text)" fontFamily="var(--font-digits)" fontSize="16">
              {formatDateShort(hover.d)}: {hover.n}
            </text>
          </g>
        )}
      </svg>
      <figcaption style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', color: 'var(--c-text-muted)', fontSize: fs(15), marginTop: 6 }}>
        меньше
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} style={{ width: 12, height: 12, background: `var(--c-heat-${l})`, display: 'inline-block' }} />
        ))}
        больше
      </figcaption>
    </figure>
  );
}
