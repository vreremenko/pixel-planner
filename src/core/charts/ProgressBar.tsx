interface Props {
  value: number; // 0..1
  color?: string;
  /** Ширина в «пикселях» сетки: один сегмент = 4 CSS px. */
  segments?: number;
  height?: number;
  label: string;
}

/** Пиксельная полоса прогресса из сегментов (как полоска HP в NES-играх). */
export function ProgressBar({ value, color = 'var(--c-gold)', segments = 40, height = 12, label }: Props) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * segments);
  return (
    <svg
      viewBox={`0 0 ${segments * 4 + 4} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      style={{ display: 'block' }}
    >
      <rect x={0} y={0} width={segments * 4 + 4} height={height} fill="var(--c-border)" />
      <rect x={2} y={2} width={segments * 4} height={height - 4} fill="var(--c-bg)" />
      {Array.from({ length: filled }, (_, i) => (
        <rect key={i} x={2 + i * 4} y={2} width={3} height={height - 4} fill={color} />
      ))}
    </svg>
  );
}
