// Assembles the Studio package. Run through ./release.
//
// The zip is written here, byte by byte, instead of with the `zip` program, so that the result does
// not depend on the clock, the time zone, file permissions on this computer or the order the disk
// lists files in: every entry gets the date from version.json, fixed permissions and a sorted name.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stop = (msg) => {
  console.error(`RELEASE REFUSED: ${msg}`);
  process.exit(1);
};
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

// ---------- what must be true first ----------
let commit;
try {
  commit = git('rev-parse', '--short=7', 'HEAD');
} catch (e) {
  stop('this folder is not a git repository, so the package cannot name its commit.');
}
const dirty = git('status', '--porcelain');
if (dirty) stop(`there are changes that are not committed, so the commit id would not describe the package:\n${dirty}\nCommit them (or put them aside) and run ./release again.`);

// Things that must never ship. Checked in studio/ itself, where a running server leaves them.
const FORBIDDEN = [
  [/(^|\/)\.env(\.(?!example$)[^/]*)?$/, 'holds the API key'],
  [/(^|\/)models(\/|$)/, 'voice model files are downloaded on the Studio, not shipped'],
  [/(^|\/)(__pycache__|\.venv|node_modules|\.cache|\.pytest_cache)(\/|$)/, 'a cache'],
  [/\.pyc$/, 'a cache'],
  [/(^|\/)\.DS_Store$/, 'a Finder leftover'],
];
function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(rel + '/', ...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}
const present = walk(path.join(root, 'studio'));
const bad = present.flatMap((rel) => {
  const hit = FORBIDDEN.find(([re]) => re.test(rel.replace(/\/$/, '')));
  return hit ? [`  studio/${rel}  (${hit[1]})`] : [];
});
if (bad.length) stop(`these must not be in a package. Remove them from studio/ and run ./release again:\n${bad.join('\n')}`);

// ---------- build into a temporary folder, stamped with the commit ----------
const { version, date } = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wq-release-'));
try {
  execFileSync(process.execPath, [path.join(root, 'build.mjs'), '--out', tmp], { env: { ...process.env, WQ_COMMIT: commit }, stdio: ['ignore', 'ignore', 'inherit'] });

  // The package is the tracked contents of studio/, with the built files taken from the fresh build.
  const BUILT = new Set(['studio/www/index.html', 'studio/www/icon-180.png', 'studio/server.py']);
  const EXEC = /(\.command|\.sh|^studio\/server\.py)$/;
  const files = git('ls-files', '-z', 'studio').split('\0').filter(Boolean).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const b of BUILT) if (!files.includes(b)) stop(`${b} is not tracked.`);

  const TOP = 'WedgeQuest-Studio/';
  const entries = files.map((rel) => ({
    name: TOP + rel.slice('studio/'.length),
    data: fs.readFileSync(path.join(BUILT.has(rel) ? tmp : root, rel)),
    mode: EXEC.test(rel) ? 0o755 : 0o644,
  }));

  const name = `WedgeQuest-Studio-${version}.zip`;
  const zip = makeZip(entries, date);
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  fs.mkdirSync(path.join(root, 'release'), { recursive: true });
  fs.writeFileSync(path.join(root, 'release', name), zip);
  fs.writeFileSync(path.join(root, 'release', name + '.sha256'), `${sha}  ${name}\n`);
  console.log(`Wedge Quest Studio ${version} (${date}, ${commit})`);
  console.log(`release/${name}  ${entries.length} files, ${(zip.length / 1024).toFixed(0)} KB`);
  console.log(`sha256  ${sha}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- a small, deterministic zip writer ----------
function makeZip(entries, isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dosDate = ((y - 1980) << 9) | (m << 5) | d;
  const dosTime = 12 << 11; // 12:00:00, the same on every computer
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const packed = zlib.deflateRawSync(e.data, { level: 9 });
    const stored = packed.length >= e.data.length;
    const body = stored ? e.data : packed;
    const crc = crc32(e.data);
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0); // version needed
    common.writeUInt16LE(0x0800, 2); // names are UTF-8
    common.writeUInt16LE(stored ? 0 : 8, 4);
    common.writeUInt16LE(dosTime, 6);
    common.writeUInt16LE(dosDate, 8);
    common.writeUInt32LE(crc, 10);
    common.writeUInt32LE(body.length, 14);
    common.writeUInt32LE(e.data.length, 18);
    common.writeUInt16LE(name.length, 22);
    common.writeUInt16LE(0, 24); // no extra field
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), common, name, body]);
    const head = Buffer.alloc(20);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE((3 << 8) | 20, 4); // made on Unix, so the permissions below are honoured
    const tail = Buffer.alloc(14);
    tail.writeUInt16LE(0, 0); // comment length
    tail.writeUInt16LE(0, 2); // disk number
    tail.writeUInt16LE(0, 4); // internal attributes
    tail.writeUInt32LE(((0o100000 | e.mode) << 16) >>> 0, 6); // regular file with these permissions
    tail.writeUInt32LE(offset, 10);
    central.push(Buffer.concat([head.subarray(0, 6), common, tail, name]));
    locals.push(local);
    offset += local.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
