// Builds the game three ways from the same source:
//   dist/index.html      the page published as a Claude artifact (loads three.js and fonts from CDNs)
//   dist/dev.html        the same plus a mock Claude runtime and a stand-in page skeleton, for local testing
//   studio/www/          the home-server edition: everything served locally, plus the server bridge and studio voice
//   node build.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const MODULES = ['layout', 'bank', 'questions', 'theme', 'audio', 'voice', 'textures', 'scenery', 'scene', 'ui', 'play-ui', 'game'];
// The home-server edition adds the server bridge and the studio voice just before the game starts.
const STUDIO_MODULES = [...MODULES.slice(0, -1), 'studio', 'voice-studio', 'game'];

function bundle(names) {
  let js = '';
  for (const name of names) {
    const code = read(`src/${name}.js`);
    new vm.Script(code, { filename: `src/${name}.js` }); // syntax check
    js += `\n/* ---- ${name}.js ---- */\n${code}\n`;
  }
  if (js.includes('</script')) throw new Error('script text contains a closing script tag');
  return js;
}

const css = read('src/style.css');
const template = read('src/template.html');
const assemble = (tpl, js) => tpl.replace('/*@CSS*/', () => css).replace('/*@JS*/', () => js);

// ---------- the artifact and the dev page ----------
const page = assemble(template, bundle(MODULES));
const prod = page.replace('<!--@DEV-->', '');
const dev = page.replace('<!--@DEV-->', () => `<script>\n${read('src/dev-mock.js')}\n</script>`);

const RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}';
const skeleton = (body) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${RESET}</style></head><body>${body}</body></html>`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), prod);
fs.writeFileSync(path.join(root, 'dist/dev.html'), skeleton(dev));
console.log(`built dist/index.html (${(prod.length / 1024).toFixed(0)} KB) and dist/dev.html`);

// ---------- the home-server edition ----------
const www = path.join(root, 'studio/www');

// Everything the page loads from the server must be there and untouched.
const lockPath = path.join(root, 'studio/vendor.lock.json');
if (!fs.existsSync(lockPath)) throw new Error('studio/vendor.lock.json is missing: run `node tools/vendor.mjs` first');
for (const [rel, meta] of Object.entries(JSON.parse(fs.readFileSync(lockPath, 'utf8')))) {
  const file = path.join(www, rel);
  if (!fs.existsSync(file)) throw new Error(`studio/www/${rel} is missing: run \`node tools/vendor.mjs\``);
  if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== meta.sha256) throw new Error(`studio/www/${rel} does not match studio/vendor.lock.json`);
}
if (!fs.existsSync(path.join(www, 'fonts/fonts.css'))) throw new Error('studio/www/fonts/fonts.css is missing: run `node tools/vendor.mjs`');

// A small pie-chart icon (for the browser tab and the iPad home screen), drawn here so no image file is needed.
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
fs.writeFileSync(path.join(www, 'icon-180.png'), pieIcon(180));

const localTemplate = template
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="/fonts/fonts.css">')
  .replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
  .replaceAll('https://cdn.jsdelivr.net/npm/three@0.147.0/', '/vendor/three-0.147.0/');
const local = assemble(localTemplate, bundle(STUDIO_MODULES)).replace('<!--@DEV-->', '');

// The page must not reach for anything outside the server: no CDN, no font service.
const outside = [...local.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)/g)].map((m) => m[1]);
if (outside.length) throw new Error(`the home-server page still loads from outside: ${outside.join(', ')}`);
for (const m of local.matchAll(/(?:src|href)=["'](\/[^"'#?]+)/g)) {
  if (!fs.existsSync(path.join(www, m[1]))) throw new Error(`the page refers to ${m[1]}, which is not in studio/www`);
}

const studioShell = (body) =>
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta name="theme-color" content="#050827">' +
  '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Wedge Quest">' +
  '<link rel="icon" type="image/png" href="/icon-180.png"><link rel="apple-touch-icon" href="/icon-180.png">' +
  `<style>${RESET}</style></head><body>${body}</body></html>`;

fs.writeFileSync(path.join(www, 'index.html'), studioShell(local));
console.log(`built studio/www/index.html (${(studioShell(local).length / 1024).toFixed(0)} KB), served with its own copy of three.js and the fonts`);
