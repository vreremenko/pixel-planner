/*
 * Анимация упражнения из листа кадров (кадры в ряд на белом фоне; рядов может быть несколько) →
 * src/modules/gym/ui/anims/<id>.ts
 *   node scripts/anim-from-sheet.mjs <лист.png> <номер ряда с 0> <id упражнения> [клетка=3.5] [цветов=40] > src/modules/gym/ui/anims/<id>.ts
 * Ряды и кадры находятся по пустым промежуткам. Кадры приводятся к общему размеру: по центру и по линии пола,
 * чтобы фигура не «плавала» в анимации.
 */
import { readPng } from './png.mjs';
import { ALPHA, grid, hex, kmeans, outline, padTo, smooth, trim, tsRows } from './pixelize.mjs';

const [, , file, rowArg, id, cellArg, kArg] = process.argv;
if (!file || rowArg === undefined || !id) {
  console.error('нужно: <лист.png> <номер ряда> <id упражнения>');
  process.exit(1);
}
const img = readPng(file);
const CELL = Number(cellArg ?? 3.5);
const K = Number(kArg ?? 40);
const ink = (x, y) => { const c = img.px(x, y); return c[0] + c[1] + c[2] < 690; };

/** Отрезки [начало, конец], где есть «чернила», по одной оси; короче minLen — шум. */
function spans(n, has, minLen) {
  const out = []; let a = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && has(i);
    if (on && a < 0) a = i;
    if (!on && a >= 0) { if (i - a > minLen) out.push([a, i - 1]); a = -1; }
  }
  return out;
}
const rows = spans(img.h, (y) => { for (let x = 0; x < img.w; x++) if (ink(x, y)) return true; return false; }, 20);
const band = rows[Number(rowArg)];
if (!band) { console.error(`в листе рядов: ${rows.length}`); process.exit(1); }
const [y0, y1] = band;
const frames = spans(img.w, (x) => { for (let y = y0; y <= y1; y++) if (ink(x, y)) return true; return false; }, 15);

let grids = frames.map(([x0, x1]) => trim(grid(img, x0 - 2, x1 + 3, y0 - 2, y1 + 3, CELL)));
const W = Math.max(...grids.map((g) => g[0].length)) + 2;
const H = Math.max(...grids.map((g) => g.length)) + 1;
grids = grids.map((g) => outline(smooth(padTo(g, W, H))));
const q = kmeans(grids.flat(2).filter(Boolean), K);
const enc = (g) => g.map((r) => r.map((c) => (c ? ALPHA[q.idx(c)] : '.')).join(''));
console.log(`/* СГЕНЕРИРОВАНО scripts/anim-from-sheet.mjs — не править руками. Анимация «${id}»: кадры одного размера, символ — индекс в PALETTE. */
export const W = ${W};
export const H = ${H};
export const PALETTE = ${JSON.stringify(q.cent.map(hex))};
export const FRAMES = [
${grids.map((g) => tsRows(enc(g))).join(',\n')},
];`);
