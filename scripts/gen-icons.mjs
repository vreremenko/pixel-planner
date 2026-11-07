/* Значки приложения: пиксельный календарь с отмеченным днём. Рисуется по сетке 32×32, запуск: node scripts/gen-icons.mjs */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const C = { bg: [11, 10, 24, 255], line: [90, 86, 200, 255], body: [20, 18, 44, 255], head: [31, 28, 63, 255], cell: [51, 49, 94, 255], pink: [240, 79, 180, 255], ring: [141, 139, 194, 255], none: [0, 0, 0, 0] };
const N = 32;

function draw(sparkles) {
  const g = Array.from({ length: N }, () => new Array(N).fill(C.none));
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = c;
  };
  // Корпус со срезанными углами
  rect(3, 7, 28, 28, C.line);
  for (const [x, y] of [[3, 7], [4, 7], [3, 8], [28, 7], [27, 7], [28, 8], [3, 28], [4, 28], [3, 27], [28, 28], [27, 28], [28, 27]]) g[y][x] = C.none;
  rect(4, 8, 27, 27, C.body);
  for (const [x, y] of [[4, 8], [27, 8], [4, 27], [27, 27]]) g[y][x] = C.line;
  rect(5, 8, 26, 12, C.head);
  rect(4, 13, 27, 13, C.line);
  // Кольца и полоска заголовка
  rect(9, 4, 11, 9, C.ring);
  rect(20, 4, 22, 9, C.ring);
  rect(6, 11, 13, 11, C.pink);
  // Дни
  for (const y of [15, 19, 23]) for (const x of [6, 11, 16, 21]) rect(x, y, x + 3, y + 2, C.cell);
  // Отмеченный день
  rect(20, 18, 25, 22, C.pink);
  for (const [x, y] of [[21, 20], [22, 21], [23, 20], [24, 19]]) g[y][x] = C.bg;
  if (sparkles) {
    for (const [x, y] of [[29, 3], [1, 30]]) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) g[y + dy][x + dx] = C.pink;
  }
  return g;
}

function crc(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const head = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(head.length + 8);
  out.writeUInt32BE(data.length, 0);
  head.copy(out, 4);
  out.writeUInt32BE(crc(head), head.length + 4);
  return out;
}

/** Сетка увеличивается без сглаживания и ставится по центру холста. */
function png(path, size, scale, { bg, sparkles }) {
  const g = draw(sparkles);
  const pad = Math.floor((size - N * scale) / 2);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - pad) / scale);
      const gy = Math.floor((y - pad) / scale);
      const cell = g[gy]?.[gx] ?? C.none;
      const px = cell[3] === 0 && bg ? C.bg : cell;
      Buffer.from(px).copy(raw, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const dir = 'public/icons';
png(`${dir}/favicon-32.png`, 32, 1, { bg: false, sparkles: false });
png(`${dir}/apple-touch-icon.png`, 180, 5, { bg: true, sparkles: true });
png(`${dir}/icon-192.png`, 192, 5, { bg: true, sparkles: true });
png(`${dir}/icon-512.png`, 512, 14, { bg: true, sparkles: true });
png(`${dir}/icon-maskable-512.png`, 512, 12, { bg: true, sparkles: false });
