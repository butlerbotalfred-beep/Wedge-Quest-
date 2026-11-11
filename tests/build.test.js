// The build identity: one version source, stamped into every page and into the server.
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
let checks = 0;
const eq = (a, b, m) => { checks++; assert.deepStrictEqual(a, b, m); };
const ok = (c, m) => { checks++; assert.ok(c, m); };

// the line shown in the game menu
require('../src/build-info.js');
const B = globalThis.WQBuild;
eq(B.line({ version: '1.0.1', date: '2026-11-11', commit: 'abc1234' }), 'Wedge Quest 1.0.1 · 11 Nov 2026 · abc1234');
eq(B.line({ version: '2.0.0', date: '2027-01-05', commit: 'source' }), 'Wedge Quest 2.0.0 · 5 Jan 2027 · source');
eq(B.line(null), 'Wedge Quest (unknown build)', 'a page without a stamp says so instead of failing');
eq(B.line({ version: '1.0.1' }), 'Wedge Quest 1.0.1', 'missing parts are left out');
eq(B.same({ version: '1', date: 'd', commit: 'c' }, { version: '1', date: 'd', commit: 'c' }), true);
eq(B.same({ version: '1', date: 'd', commit: 'c' }, { version: '1', date: 'd', commit: 'x' }), false);
eq(B.same(null, { version: '1' }), false);

// a build into a separate folder carries the same identity everywhere
const want = { ...JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')), commit: 'abc1234' };
ok(/^\d+\.\d+\.\d+$/.test(want.version) && /^\d{4}-\d\d-\d\d$/.test(want.date), 'version.json holds a version and a date');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wq-build-'));
try {
  execFileSync(process.execPath, [path.join(root, 'build.mjs'), '--out', out], { env: { ...process.env, WQ_COMMIT: 'abc1234' }, stdio: 'pipe' });
  const stamp = (file) => {
    const m = fs.readFileSync(path.join(out, file), 'utf8').match(/window\.WQ_BUILD = (\{[^}]*\});/);
    ok(m, `${file} carries a build stamp`);
    return JSON.parse(m[1]);
  };
  for (const page of ['dist/index.html', 'dist/dev.html', 'studio/www/index.html']) eq(stamp(page), want, `${page} is stamped`);
  const server = fs.readFileSync(path.join(out, 'studio/server.py'), 'utf8').match(/^BUILD = (\{.*\})$/m);
  ok(server, 'server.py carries a build stamp');
  eq(JSON.parse(server[1]), want, 'the server is stamped with the same build as the page');
  ok(fs.existsSync(path.join(out, 'studio/www/icon-180.png')), 'the icon is written too');
  ok(fs.readFileSync(path.join(out, 'studio/www/index.html'), 'utf8').includes('WQBuild.line'), 'the menu code that shows the build is in the page');
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}

// the tracked files agree with version.json (commit "source" until a release stamps the real one)
const tracked = fs.readFileSync(path.join(root, 'studio/server.py'), 'utf8').match(/^BUILD = (\{.*\})$/m);
ok(tracked, 'the tracked server.py has a BUILD line');
eq(JSON.parse(tracked[1]), { ...want, commit: 'source' });

console.log(`All ${checks} build identity checks passed`);
