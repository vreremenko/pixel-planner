import { useEffect, useState } from 'react';

const QUIET = 4;

/** QR-код: белая подложка и чёрные квадраты — так его читают камеры лучше всего. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const [rows, setRows] = useState<boolean[][] | null>(null);

  useEffect(() => {
    let off = false;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      const m = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => qr.isDark(y, x)));
      if (!off) setRows(m);
    });
    return () => {
      off = true;
    };
  }, [text]);

  if (!rows) return <div style={{ width: 'min(100%, 280px)', aspectRatio: '1' }} />;
  const size = rows.length + QUIET * 2;
  const path = rows
    .flatMap((r, y) => r.map((dark, x) => (dark ? `M${String(x + QUIET)} ${String(y + QUIET)}h1v1h-1z` : '')))
    .join('');
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${String(size)} ${String(size)}`} shapeRendering="crispEdges" style={{ width: 'min(100%, 280px)', height: 'auto', display: 'block', background: '#fff' }}>
      <path d={path} fill="#000" />
    </svg>
  );
}
