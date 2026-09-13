// Genera le icone PNG della PWA senza dipendenze esterne (encoder PNG con zlib di Node).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [15, 17, 21];
const FG = [91, 140, 255];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Rettangolo arrotondato in coordinate normalizzate 0..1. */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function dumbbell(x, y) {
  const shapes = [
    [0.27, 0.465, 0.73, 0.535, 0.02],
    [0.2, 0.3, 0.3, 0.7, 0.035],
    [0.7, 0.3, 0.8, 0.7, 0.035],
    [0.12, 0.37, 0.21, 0.63, 0.03],
    [0.79, 0.37, 0.88, 0.63, 0.03],
  ];
  return shapes.some(([a, b, c, d, r]) => inRoundRect(x, y, a, b, c, d, r));
}

function render(size, { maskable = false, rounded = true } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4;
  const scale = maskable ? 0.72 : 0.9;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size;
          const y = (py + (sy + 0.5) / S) / size;
          const inBg = maskable || !rounded ? true : inRoundRect(x, y, 0, 0, 1, 1, 0.22);
          if (!inBg) continue;
          bg++;
          const ux = 0.5 + (x - 0.5) / scale;
          const uy = 0.5 + (y - 0.5) / scale;
          if (dumbbell(ux, uy)) fg++;
        }
      }
      const total = S * S;
      const a = bg / total;
      const t = bg ? fg / bg : 0;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(BG[c] * (1 - t) + FG[c] * t);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, buf);
}

const outputs = [
  ['icon-192.png', render(192)],
  ['icon-512.png', render(512)],
  ['icon-maskable-512.png', render(512, { maskable: true })],
  ['apple-touch-icon.png', render(180, { rounded: false })],
];
for (const [name, data] of outputs) {
  writeFileSync(join(outDir, name), data);
  console.log(`icons/${name} (${data.length} byte)`);
}
