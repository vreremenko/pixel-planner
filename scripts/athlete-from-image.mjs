/*
 * Спрайт атлета из картинки (спереди слева, сзади справа на белом фоне) → src/modules/gym/ui/athleteSprite.ts
 *   node scripts/athlete-from-image.mjs ~/Downloads/athlete.png > src/modules/gym/ui/athleteSprite.ts
 * (необязательно: размер клетки в точках, по умолчанию 8, и число цветов палитры, по умолчанию 62)
 * Картинка из нейросети: «пиксели» неровные (~8.5 точки), поэтому в каждой клетке берём самый частый цвет,
 * затем сводим цвета в общую палитру (k-средних). Разметка мышц — вручную в athleteMasks.ts.
 */
import { readPng } from './png.mjs';
const [, , file, cellArg, kArg] = process.argv;
const img = readPng(file);
const CELL = Number(cellArg ?? 8);
const K = Number(kArg ?? 62);
const isBg = (c) => c[0] > 228 && c[1] > 228 && c[2] > 228;
function grid(x0, x1, y0, y1) {
  const cols = Math.round((x1 - x0) / CELL), rows = Math.round((y1 - y0) / CELL);
  const g = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const cx = x0 + (c + 0.5) * CELL, cy = y0 + (r + 0.5) * CELL;
      // самый частый цвет в окрестности центра клетки (края клеток размыты)
      const votes = new Map();
      // окно 3×3: шире — и мелкие детали лица (глаза, рот) растворяются в коже
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
// k-средних по цветам обеих фигур
function kmeans(colors, k) {
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
const front = grid(170, 700, 18, 1002), back = grid(820, 1360, 18, 1002);
// обрезка пустых колонок по краям, одинаковая ширина
const trim = (g) => { const used = g[0].map((_, c) => g.some((r) => r[c])); const a = used.indexOf(true), b = used.lastIndexOf(true); return g.map((r) => r.slice(Math.max(0, a - 1), b + 2)); };
let F = trim(front), B = trim(back);
const W = Math.max(F[0].length, B[0].length);
const pad = (g) => g.map((r) => { const l = Math.floor((W - r.length) / 2); return [...Array(l).fill(null), ...r, ...Array(W - r.length - l).fill(null)]; });
F = pad(F); B = pad(B);
// Сглаживание контура: края клеток смешаны с белым фоном, поэтому силуэт выходит «покусанным».
const N4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const filled = (g, x, y) => y >= 0 && y < g.length && x >= 0 && x < g[0].length && g[y][x] !== null;
const count = (g, x, y) => N4.filter(([dx, dy]) => filled(g, x + dx, y + dy)).length;
function smooth(g) {
  for (let pass = 0; pass < 2; pass++) {
    // одиночные выступы (≤1 соседа) убираем, выщерблины (≥3 соседей) заполняем самым тёмным соседом
    const next = g.map((r) => r.slice());
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
      const n = count(g, x, y);
      if (g[y][x] && n <= 1) next[y][x] = null;
      else if (!g[y][x] && n >= 3) {
        const nb = N4.map(([dx, dy]) => filled(g, x + dx, y + dy) ? g[y + dy][x + dx] : null).filter(Boolean);
        next[y][x] = nb.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))[0];
      }
    }
    g = next;
  }
  return g;
}
const OUTLINE = [13, 10, 11];
// Ровный контур в 1 пиксель: крайние клетки силуэта — тёмные
const outline = (g) => g.map((r, y) => r.map((c, x) => (c && count(g, x, y) < 4 ? OUTLINE : c)));
F = outline(smooth(F)); B = outline(smooth(B));
// Лицо крупным планом: на исходнике глаза сливаются с бровями в тёмную полосу — дорисовываем черты.
// Координаты — для клетки 8 (сетка 68×123); при другой клетке сдвиньте или уберите.
if (CELL === 8) {
  const SKIN = [222, 143, 74], WHITE = [236, 228, 216], PUPIL = [20, 14, 14], LIP = [110, 50, 28];
  const paint = (x, y, c) => { if (F[y]?.[x]) F[y][x] = c; };
  // глаза: белок + зрачок, между ними переносица
  [[30, SKIN], [31, WHITE], [32, PUPIL], [33, SKIN], [34, SKIN], [35, SKIN], [36, PUPIL], [37, WHITE], [38, SKIN]].forEach(([x, c]) => paint(x, 12, c));
  paint(34, 11, SKIN);
  // нос — едва заметная тень, без тёмного пятна под ним
  const NOSE = [206, 124, 64];
  paint(34, 13, NOSE); paint(34, 14, NOSE);
  for (let x = 32; x <= 36; x++) paint(x, 15, SKIN);
  // рот: твёрдая линия
  for (let x = 32; x <= 36; x++) paint(x, 16, LIP);
}
const all = [...F, ...B].flat().filter(Boolean);
const q = kmeans(all, K);
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const enc = (g) => g.map((r) => r.map((c) => (c ? ALPHA[q.idx(c)] : '.')).join(''));
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const arr = (rows) => '[\n' + rows.map((r) => `  '${r}',\n`).join('') + ']';
console.log(`/* СГЕНЕРИРОВАНО scripts/athlete-from-image.mjs — не править руками. Символ — индекс в PALETTE, '.' — пусто. */
export const SPRITE_W = ${W};
export const SPRITE_H = ${F.length};
export const PALETTE = ${JSON.stringify(q.cent.map(hex))};
export const PALETTE_KEYS = '${ALPHA}';
export const FRONT = ${arr(enc(F))};
export const BACK = ${arr(enc(B))};`);
