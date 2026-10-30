import { useState } from 'react';

interface Bar {
  label: string;
  value: number;
  /** Подпись для подсказки, напр. «Пн: 5 закрыто». */
  hint: string;
}

interface Props {
  bars: Bar[];
  color?: string;
  /** Высота области графика в «блоках» по 4px. */
  rows?: number;
  title: string;
}

const B = 4; // размер пиксельного блока

/** Пиксельная столбчатая диаграмма: столбцы собраны из блоков 4×4 без сглаживания. */
export function BarChart({ bars, color = 'var(--c-task)', rows = 24, title }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const colW = 8; // блоков на столбец
  const gap = 3;
  const width = bars.length * (colW + gap) * B;
  const chartH = rows * B;
  const labelH = 20;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${chartH + labelH}`}
        width="100%"
        shapeRendering="crispEdges"
        role="img"
        aria-label={title}
        style={{ display: 'block', maxHeight: 260, overflow: 'visible' }}
      >
        {/* Сетка: пунктир каждые 6 блоков */}
        {Array.from({ length: Math.floor(rows / 6) + 1 }, (_, i) => (
          <g key={i}>
            {Array.from({ length: Math.ceil(width / (B * 3)) }, (_, j) => (
              <rect key={j} x={j * B * 3} y={chartH - i * 6 * B} width={B} height={1} fill="var(--c-panel-3)" />
            ))}
          </g>
        ))}
        {bars.map((b, i) => {
          const h = b.value === 0 ? 0 : Math.max(1, Math.round((b.value / max) * rows));
          const x = i * (colW + gap) * B + (gap * B) / 2;
          const active = hover === i;
          return (
            <g
              key={b.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={b.hint}
              role="img"
              style={{ outline: 'none' }}
            >
              {/* Невидимая зона наведения больше самого столбца */}
              <rect x={x - B} y={0} width={(colW + 2) * B} height={chartH + labelH} fill="transparent" />
              {Array.from({ length: h }, (_, k) => (
                <rect key={k} x={x} y={chartH - (k + 1) * B} width={colW * B} height={B - 1} fill={color} opacity={active || hover === null ? 1 : 0.55} />
              ))}
              <rect x={x} y={chartH} width={colW * B} height={B / 2} fill="var(--c-border)" />
              <text x={x + (colW * B) / 2} y={chartH + 16} textAnchor="middle" fill={active ? 'var(--c-text)' : 'var(--c-text-dim)'} fontFamily="var(--font-title)" fontSize="8">
                {b.label}
              </text>
              {active && (
                <g>
                  <rect x={x - 6} y={chartH - h * B - 26} width={colW * B + 12} height={20} fill="var(--c-bg)" stroke="var(--c-xp)" strokeWidth={2} />
                  <text x={x + (colW * B) / 2} y={chartH - h * B - 11} textAnchor="middle" fill="var(--c-text)" fontFamily="var(--font-digits)" fontSize="18">
                    {b.value}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              <td>{b.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
