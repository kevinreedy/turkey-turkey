// Generates the PNG app icons (no dependencies). Run: node tools/make-icons.mjs
// Draws the same mark as icons/icon.svg: an amber bowling ball on the dark ground.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x16, 0x12, 0x0e];
const BALL = [0xf4, 0xa3, 0x40];
const HOLE = [0x16, 0x12, 0x0e];
const SHINE = [0xf8, 0xbe, 0x72];

// Shapes in a 100×100 design space, painted back to front.
const shapes = [
  { cx: 50, cy: 52, r: 34, c: BALL },
  { cx: 38, cy: 36, r: 8, c: SHINE, clip: { cx: 50, cy: 52, r: 34 } },
  { cx: 44, cy: 40, r: 5, c: HOLE },
  { cx: 57, cy: 37, r: 5, c: HOLE },
  { cx: 55, cy: 51, r: 5.5, c: HOLE },
];

function crc32(buf) {
  let c;
  const table = (crc32.t ||= Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const SS = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 100;
          const v = ((y + (sy + 0.5) / SS) / size) * 100;
          let col = BG;
          for (const s of shapes) {
            const inside = (u - s.cx) ** 2 + (v - s.cy) ** 2 <= s.r ** 2;
            const clipped = !s.clip || (u - s.clip.cx) ** 2 + (v - s.clip.cy) ** 2 <= s.clip.r ** 2;
            if (inside && clipped) col = s.c;
          }
          acc[0] += col[0];
          acc[1] += col[1];
          acc[2] += col[2];
        }
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(acc[0] / (SS * SS));
      raw[o + 1] = Math.round(acc[1] / (SS * SS));
      raw[o + 2] = Math.round(acc[2] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../icons/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(new URL(name, out), png(size));
  console.log('wrote icons/' + name);
}
