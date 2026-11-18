/*
 * Пиксельный график одного показателя тела. В отличие от столбиков TrendChart шкала начинается
 * не с нуля, а чуть ниже минимума: разница 82 и 81 кг должна быть видна. По оси X — настоящее время
 * между замерами, а не порядковый номер.
 */
import { useEffect, useRef, useState } from 'react';
import { diffDays, formatDateShort } from '../../../core/domain/dates';
import { formatValue } from '../../../core/domain/numbers';
import type { MetricPoint } from '../domain/body';

/** Ширина по умолчанию, пока не измерили блок; потом рисуем в настоящих пикселях — подписи не мельчают на телефоне. */
const DEFAULT_W = 600;
const H = 200;
const LEFT = 56;
const RIGHT = 14;
const TOP = 28;
const BOTTOM = 24;
const DOT = 8;

export function BodyChart({ points, unit, title }: { points: readonly MetricPoint[]; unit: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(DEFAULT_W);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setW(Math.max(260, Math.round(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;

  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  // Запас сверху и снизу; ровная линия — по середине
  const pad = Math.max((hi - lo) * 0.15, hi === lo ? Math.max(1, hi * 0.02) : 0);
  lo -= pad;
  hi += pad;
  const span = diffDays(last.date, first.date);
  const plotW = W - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const xOf = (i: number) => {
    const p = points[i];
    if (!p || span === 0) return Math.round(LEFT + plotW / 2);
    return Math.round(LEFT + (diffDays(p.date, first.date) / span) * plotW);
  };
  const yOf = (v: number) => Math.round(TOP + plotH - ((v - lo) / (hi - lo)) * plotH);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${String(xOf(i))} ${String(yOf(p.value))}`).join('');
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad].filter((t, i, a) => a.indexOf(t) === i);
  const hp = hover === null ? null : points[hover];

  return (
    <figure ref={box} style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} width="100%" shapeRendering="crispEdges" role="img" aria-label={title} style={{ display: 'block', touchAction: 'pan-y' }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            {Array.from({ length: Math.ceil(plotW / 8) }, (_, j) => (
              <rect key={j} x={LEFT + j * 8} y={yOf(t)} width={4} height={1} fill="var(--c-panel-3)" />
            ))}
            <text x={LEFT - 8} y={yOf(t) + 5} textAnchor="end" fill="var(--c-text-muted)" fontFamily="var(--font-digits)" fontSize="15">
              {formatValue(Math.round(t * 10) / 10)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--c-gym)" strokeWidth={3} strokeLinejoin="miter" />
        {points.map((p, i) => {
          const x = xOf(i);
          const prevX = i > 0 ? xOf(i - 1) : LEFT;
          const nextX = i < points.length - 1 ? xOf(i + 1) : W - RIGHT;
          const active = hover === i;
          return (
            <g key={p.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              {/* Невидимая полоса до середины соседних точек — чтобы попасть пальцем */}
              <rect x={Math.round((prevX + x) / 2)} y={0} width={Math.max(1, Math.round((nextX - prevX) / 2))} height={H} fill="transparent" />
              <rect x={x - DOT / 2} y={yOf(p.value) - DOT / 2} width={DOT} height={DOT} fill={active ? 'var(--c-text)' : 'var(--c-gym)'} stroke="var(--c-bg)" strokeWidth={2} />
            </g>
          );
        })}
        <text x={LEFT} y={H - 4} textAnchor="start" fill="var(--c-text-muted)" fontFamily="var(--font-digits)" fontSize="15">
          {formatDateShort(first.date)}
        </text>
        {points.length > 1 && (
          <text x={W - RIGHT} y={H - 4} textAnchor="end" fill="var(--c-text-muted)" fontFamily="var(--font-digits)" fontSize="15">
            {formatDateShort(last.date)}
          </text>
        )}
        {hp && hover !== null && (
          <g pointerEvents="none">
            {(() => {
              const label = `${formatDateShort(hp.date)}: ${formatValue(hp.value)} ${unit}`;
              const w = label.length * 10 + 14;
              const x = Math.min(Math.max(LEFT, xOf(hover) - w / 2), W - w - 2);
              return (
                <>
                  <rect x={x} y={0} width={w} height={22} fill="var(--c-bg)" stroke="var(--c-gym)" strokeWidth={2} />
                  <text x={x + w / 2} y={16} textAnchor="middle" fill="var(--c-text)" fontFamily="var(--font-digits)" fontSize="17">
                    {label}
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </svg>
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <th scope="row">{p.date}</th>
                <td>
                  {p.value} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
