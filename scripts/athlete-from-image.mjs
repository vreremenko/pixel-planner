/*
 * Спрайт атлета из картинки (спереди слева, сзади справа на белом фоне) → src/modules/gym/ui/athleteSprite.ts
 *   node scripts/athlete-from-image.mjs ~/Downloads/athlete.png > src/modules/gym/ui/athleteSprite.ts
 * (необязательно: размер клетки в точках, по умолчанию 8, и число цветов палитры, по умолчанию 62)
 * Картинка из нейросети: «пиксели» неровные (~8.5 точки), поэтому в каждой клетке берём самый частый цвет,
 * затем сводим цвета в общую палитру (k-средних). Разметка мышц — вручную в athleteMasks.ts.
 */
import { readPng } from './png.mjs';
import { ALPHA, grid, hex, kmeans, outline, smooth, tsRows } from './pixelize.mjs';
const [, , file, cellArg, kArg] = process.argv;
const img = readPng(file);
const CELL = Number(cellArg ?? 8);
const K = Number(kArg ?? 62);
const front = grid(img, 170, 700, 18, 1002, CELL), back = grid(img, 820, 1360, 18, 1002, CELL);
// обрезка пустых колонок по краям, одинаковая ширина
const trim = (g) => { const used = g[0].map((_, c) => g.some((r) => r[c])); const a = used.indexOf(true), b = used.lastIndexOf(true); return g.map((r) => r.slice(Math.max(0, a - 1), b + 2)); };
let F = trim(front), B = trim(back);
const W = Math.max(F[0].length, B[0].length);
const pad = (g) => g.map((r) => { const l = Math.floor((W - r.length) / 2); return [...Array(l).fill(null), ...r, ...Array(W - r.length - l).fill(null)]; });
F = pad(F); B = pad(B);
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
const enc = (g) => g.map((r) => r.map((c) => (c ? ALPHA[q.idx(c)] : '.')).join(''));
console.log(`/* СГЕНЕРИРОВАНО scripts/athlete-from-image.mjs — не править руками. Символ — индекс в PALETTE, '.' — пусто. */
export const SPRITE_W = ${W};
export const SPRITE_H = ${F.length};
export const PALETTE = ${JSON.stringify(q.cent.map(hex))};
export const PALETTE_KEYS = '${ALPHA}';
export const FRONT = ${tsRows(enc(F))};
export const BACK = ${tsRows(enc(B))};`);
