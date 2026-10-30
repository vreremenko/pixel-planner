/*
 * Общее для скриптов, переводящих картинки из нейросети в пиксель-арт (атлет, анимации упражнений):
 * у таких картинок «пиксели» неровные, поэтому в каждой клетке берём самый частый цвет, сводим цвета
 * в общую палитру (k-средних), сглаживаем силуэт и обводим ровным контуром в 1 пиксель.
 */
export const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const isBg = (c) => c[0] > 228 && c[1] > 228 && c[2] > 228;

/** Сетка цветов (null — фон) для прямоугольника картинки с клеткой cell точек. */
export function grid(img, x0, x1, y0, y1, cell) {
  const cols = Math.round((x1 - x0) / cell), rows = Math.round((y1 - y0) / cell);
  const g = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const cx = x0 + (c + 0.5) * cell, cy = y0 + (r + 0.5) * cell;
      // окно 3×3: шире — и мелкие детали лица (глаза, рот) растворяются в коже
      const votes = new Map();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const p = img.px(Math.min(img.w - 1, Math.round(cx + dx)), Math.min(img.h - 1, Math.round(cy + dy)));
        const key = isBg(p) ? 'bg' : p.map((v) => v >> 3).join(',');
        const e = votes.get(key) ?? { n: 0, sum: [0, 0, 0] };
        e.n++; if (key !== 'bg') { e.sum[0] += p[0]; e.sum[1] += p[1]; e.sum[2] += p[2]; }
        votes.set(key, e);
      }
      const [key, e] = [...votes].sort((a, b) => b[1].n - a[1].n)[0];
      row.push(key === 'bg' ? null : e.sum.map((v) => Math.round(v / e.n)));
    }
    g.push(row);
  }
  return g;
}

/** Палитра из k цветов (k-средних) и функция «цвет → индекс». */
export function kmeans(colors, k) {
  let cent = []; const step = Math.max(1, Math.floor(colors.length / k));
  const sorted = [...colors].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  for (let i = 0; i < k; i++) cent.push(sorted[Math.min(sorted.length - 1, i * step + (step >> 1))]);
  const d = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  for (let it = 0; it < 20; it++) {
    const acc = cent.map(() => [0, 0, 0, 0]);
    for (const c of colors) { let bi = 0, bd = Infinity; cent.forEach((m, i) => { const v = d(c, m); if (v < bd) { bd = v; bi = i; } }); acc[bi][0] += c[0]; acc[bi][1] += c[1]; acc[bi][2] += c[2]; acc[bi][3]++; }
    cent = acc.map((a, i) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]].map(Math.round) : cent[i]));
  }
  return { cent, idx: (c) => { let bi = 0, bd = Infinity; cent.forEach((m, i) => { const v = d(c, m); if (v < bd) { bd = v; bi = i; } }); return bi; } };
}

/** Обрезать пустые края (по колонкам и строкам). */
export function trim(g) {
  const usedC = g[0].map((_, c) => g.some((r) => r[c]));
  const a = usedC.indexOf(true), b = usedC.lastIndexOf(true);
  const rows = g.map((r) => r.slice(a, b + 1));
  const usedR = rows.map((r) => r.some(Boolean));
  return rows.slice(usedR.indexOf(true), usedR.lastIndexOf(true) + 1);
}

/** Дополнить до W×H: по центру по горизонтали, по нижнему краю (общая линия пола). */
export function padTo(g, W, H) {
  const l = Math.floor((W - g[0].length) / 2);
  const rows = g.map((r) => [...Array(l).fill(null), ...r, ...Array(W - r.length - l).fill(null)]);
  return [...Array.from({ length: H - rows.length }, () => Array(W).fill(null)), ...rows];
}

const N4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const filled = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length && g[y][x] !== null;
const count = (g, x, y) => N4.filter(([dx, dy]) => filled(g, x + dx, y + dy)).length;

/** Сглаживание: одиночные выступы (≤1 соседа) убираем, выщерблины (≥3 соседей) заполняем самым тёмным соседом. */
export function smooth(g) {
  for (let pass = 0; pass < 2; pass++) {
    const next = g.map((r) => r.slice());
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
      const n = count(g, x, y);
      if (g[y][x] && n <= 1) next[y][x] = null;
      else if (!g[y][x] && n >= 3) {
        const nb = N4.map(([dx, dy]) => (filled(g, x + dx, y + dy) ? g[y + dy][x + dx] : null)).filter(Boolean);
        next[y][x] = nb.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))[0];
      }
    }
    g = next;
  }
  return g;
}

const OUTLINE = [13, 10, 11];
/** Ровный контур в 1 пиксель: крайние клетки силуэта — тёмные. */
export const outline = (g) => g.map((r, y) => r.map((c, x) => (c && count(g, x, y) < 4 ? OUTLINE : c)));

export const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
export const tsRows = (rows) => '[\n' + rows.map((r) => `  '${r}',\n`).join('') + ']';
