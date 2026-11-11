// Draws studio/www/icon-180.png (the browser-tab and iPad home-screen icon), so no image editor is needed.
// The icon is a tracked file: run this only to change it, then commit the result. It is not part of
// the build, because compressed image bytes can differ between computers and the build must not.
//   node tools/icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pieIcon(size) {
  const colors = ['#ff39c4', '#12c8ff', '#ffc21a', '#a64bff', '#7df02a', '#ff8a1f'].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const bg = [5, 8, 39];
  const gold = [255, 210, 63];
  const px = Buffer.alloc(size * size * 4);
  const R = size * 0.37;
  const SS = 4; // 4 x 4 samples per pixel for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const dx = x + (sx + 0.5) / SS - size / 2;
          const dy = y + (sy + 0.5) / SS - size / 2;
          const d = Math.hypot(dx, dy);
          let c = bg;
          if (d < R * 0.2) c = gold;
          else if (d < R) {
            const a = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
            const w = (2 * Math.PI) / colors.length;
            const off = Math.min(a % w, w - (a % w)) * d; // distance to the nearest wedge edge, in pixels
            c = off < size * 0.012 ? bg : colors[Math.floor(a / w)];
          } else if (d < R + size * 0.025) c = gold; // thin gold rim
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      px.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), 255], (y * size + x) * 4);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(root, 'studio/www/icon-180.png'), pieIcon(180));
console.log('wrote studio/www/icon-180.png');
