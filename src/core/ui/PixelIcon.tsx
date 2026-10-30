import type { ReactElement } from 'react';
import { ICONS, isIconName } from './icons';

interface Props {
  name: string;
  /** Размер в CSS-пикселях; кратен 8, чтобы пиксели оставались целыми. */
  size?: number;
  className?: string;
  title?: string;
}

export function PixelIcon({ name, size = 16, className, title }: Props) {
  const rows = isIconName(name) ? ICONS[name] : ICONS.star;
  const rects: ReactElement[] = [];
  rows.forEach((row, y) => {
    // Склеиваем горизонтальные пробеги в один прямоугольник
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w] === '#') w++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} />);
      x += w;
    }
  });
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 8 8"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      {rects}
    </svg>
  );
}
