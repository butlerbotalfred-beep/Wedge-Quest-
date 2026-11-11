// Builds the game three ways from the same source:
//   dist/index.html      the page published as a Claude artifact (loads three.js and fonts from CDNs)
//   dist/dev.html        the same plus a mock Claude runtime and a stand-in page skeleton, for local testing
//   studio/www/          the home-server edition: everything served locally, plus the server bridge and studio voice
//   node build.mjs               writes the tracked pages in place
//   node build.mjs --out DIR     writes the same files under DIR instead (used by ./check and ./release)
// Every output carries the build identity: version and date from version.json, and the commit from
// WQ_COMMIT ("source" unless ./release sets it), so the tracked pages do not change with every commit.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const NODE_MIN = 22;
if (Number(process.versions.node.split('.')[0]) < NODE_MIN) {
  console.error(`Wedge Quest needs Node ${NODE_MIN} or newer; this is Node ${process.versions.node}. Install the current LTS from https://nodejs.org and try again.`);
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const outFlag = process.argv.indexOf('--out');
if (outFlag !== -1 && !process.argv[outFlag + 1]) throw new Error('--out needs a folder');
const outRoot = outFlag === -1 ? root : path.resolve(process.argv[outFlag + 1]);
const write = (rel, data) => {
  const file = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

// ---------- the build identity ----------
const { version, date } = JSON.parse(read('version.json'));
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !/^\d{4}-\d\d-\d\d$/.test(date || '')) throw new Error('version.json needs "version": "1.2.3" and "date": "YYYY-MM-DD"');
const commit = process.env.WQ_COMMIT || 'source';
if (!/^[0-9a-z-]{1,40}$/.test(commit)) throw new Error('WQ_COMMIT must be a short commit id');
const BUILD = JSON.stringify({ version, date, commit });

const MODULES = ['build-info', 'layout', 'bank', 'questions', 'theme', 'audio', 'voice', 'textures', 'scenery', 'scene', 'ui', 'play-ui', 'game'];
// The home-server edition adds the server bridge and the studio voice just before the game starts.
const STUDIO_MODULES = [...MODULES.slice(0, -1), 'studio', 'voice-studio', 'game'];

function bundle(names) {
  let js = `\nwindow.WQ_BUILD = ${BUILD};\n`;
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

write('dist/index.html', prod);
write('dist/dev.html', skeleton(dev));
console.log(`${version} (${date}, ${commit})\nbuilt dist/index.html (${(prod.length / 1024).toFixed(0)} KB) and dist/dev.html`);

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

if (!fs.existsSync(path.join(www, 'icon-180.png'))) throw new Error('studio/www/icon-180.png is missing: run `node tools/icon.mjs`');

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

write('studio/www/index.html', studioShell(local));

// The server carries the same identity, so a page and a server from different builds can be told apart.
const serverSrc = read('studio/server.py');
const BUILD_LINE = /^BUILD = \{.*\}$/m;
if (!BUILD_LINE.test(serverSrc)) throw new Error('studio/server.py has no BUILD line to stamp');
write('studio/server.py', serverSrc.replace(BUILD_LINE, () => `BUILD = ${BUILD}`));
if (outRoot !== root) fs.chmodSync(path.join(outRoot, 'studio/server.py'), 0o755);
console.log(`built studio/www/index.html (${(studioShell(local).length / 1024).toFixed(0)} KB), served with its own copy of three.js and the fonts`);
