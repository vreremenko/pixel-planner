import { useState } from 'react';
import { formatDateShort } from '../domain/dates';
import { formatCompact, formatValue, type DayPoint } from '../domain/habitStats';

interface Props {
  points: readonly DayPoint[];
  /** Скользящее среднее, по одному значению на точку. */
  average: readonly (number | null)[];
  unit: string;
  title: string;
}

const W = 600;
const H = 180;
const LEFT = 60;
const TOP = 14;
const BOTTOM = 22;

/** «Красивый» верх шкалы: 1, 2, 5 × 10^n. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/**
 * Пиксельный график: столбики — значения по дням, жёлтая ступенчатая линия — скользящее
 * среднее за 7 дней. Никакого сглаживания: всё на целых координатах, crispEdges.
 */
export function TrendChart({ points, average, unit, title }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const top = niceMax(Math.max(0, ...points.map((p) => p.value ?? 0), ...average.map((a) => a ?? 0)));
  const plotW = W - LEFT - 4;
  const plotH = H - TOP - BOTTOM;
  const slot = plotW / n;
  const barW = Math.max(2, Math.floor(slot * 0.7));
  const xOf = (i: number) => Math.round(LEFT + i * slot + (slot - barW) / 2);
  const yOf = (v: number) => Math.round(TOP + plotH - (v / top) * plotH);

  // Ступенчатая линия среднего: горизонталь на уровне дня, вертикаль между днями
  let path = '';
  let prevY: number | null = null;
  average.forEach((a, i) => {
    if (a === null) {
      prevY = null;
      return;
    }
    const x0 = Math.round(LEFT + i * slot);
    const x1 = Math.round(LEFT + (i + 1) * slot);
    const y = yOf(a);
    path += prevY === null ? `M${x0} ${y}` : `L${x0} ${y}`;
    path += `L${x1} ${y}`;
    prevY = y;
  });

  const ticks = [0, top / 2, top];
  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  const hp = hover === null ? null : points[hover];

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" shapeRendering="crispEdges" role="img" aria-label={title} style={{ display: 'block', maxHeight: 280 }}>
        {ticks.map((t) => (
          <g key={t}>
            {Array.from({ length: Math.ceil(plotW / 8) }, (_, j) => (
              <rect key={j} x={LEFT + j * 8} y={yOf(t)} width={4} height={1} fill="var(--c-panel-3)" />
            ))}
            <text x={LEFT - 6} y={yOf(t) + 4} textAnchor="end" fill="var(--c-text-muted)" fontFamily="var(--font-digits)" fontSize="15">
              {formatCompact(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = xOf(i);
          const active = hover === i;
          return (
            <g key={p.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={Math.round(LEFT + i * slot)} y={0} width={Math.max(1, Math.round(slot))} height={H} fill="transparent" />
              {p.value === null ? (
                <rect x={x + Math.floor(barW / 2) - 1} y={yOf(0) - 2} width={2} height={2} fill="var(--c-border)" />
              ) : (
                <rect x={x} y={yOf(p.value)} width={barW} height={yOf(0) - yOf(p.value)} fill={active ? 'var(--c-text)' : 'var(--c-habit)'} />
              )}
            </g>
          );
        })}
        <path d={path} fill="none" stroke="var(--c-xp)" strokeWidth={2} strokeLinejoin="miter" />
        <rect x={LEFT} y={yOf(0)} width={plotW} height={2} fill="var(--c-border)" />
        {labelIdx.map((i, k) => (
          <text key={i} x={LEFT + i * slot + slot / 2} y={H - 4} textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'} fill="var(--c-text-muted)" fontFamily="var(--font-digits)" fontSize="15">
            {points[i] ? formatDateShort(points[i].date) : ''}
          </text>
        ))}
        {hp && hover !== null && (
          <g pointerEvents="none">
            {(() => {
              const label = `${formatDateShort(hp.date)}: ${hp.value === null ? 'нет записи' : `${formatValue(hp.value)} ${unit}`}`;
              const w = label.length * 8 + 14;
              const x = Math.min(Math.max(LEFT, xOf(hover) - w / 2), W - w - 2);
              return (
                <>
                  <rect x={x} y={0} width={w} height={22} fill="var(--c-bg)" stroke="var(--c-xp)" strokeWidth={2} />
                  <text x={x + w / 2} y={16} textAnchor="middle" fill="var(--c-text)" fontFamily="var(--font-digits)" fontSize="17">
                    {label}
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </svg>
      <figcaption style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--c-text-dim)', fontSize: 16, marginTop: 6 }}>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--c-habit)', marginRight: 6 }} />
          за день, {unit}
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 3, background: 'var(--c-xp)', marginRight: 6, verticalAlign: 'middle' }} />
          среднее за 7 дней
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points
            .filter((p) => p.value !== null)
            .map((p) => (
              <tr key={p.date}>
                <th scope="row">{p.date}</th>
                <td>
                  {p.value} {unit}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
