import { access, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const MANIFEST = path.join(ROOT, '.pages-mirror-files.json');
const CHECK = process.argv.includes('--check');

async function filesUnder(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(absolute, relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out.sort();
}

async function exists(file) {
  try { await access(file); return true; }
  catch { return false; }
}

async function sameBytes(a, b) {
  if (!await exists(b)) return false;
  const [left, right] = await Promise.all([readFile(a), readFile(b)]);
  return left.equals(right);
}

const current = await filesUnder(PUBLIC);
let previous = [];
try { previous = JSON.parse(await readFile(MANIFEST, 'utf8')); }
catch {}

if (CHECK) {
  const mismatches = [];
  for (const relative of current) {
    if (!await sameBytes(path.join(PUBLIC, relative), path.join(ROOT, relative))) mismatches.push(relative);
  }
  for (const relative of previous) {
    if (!current.includes(relative) && await exists(path.join(ROOT, relative))) mismatches.push(`${relative} (stale)`);
  }
  if (!await exists(path.join(ROOT, '.nojekyll'))) mismatches.push('.nojekyll');
  if (mismatches.length) {
    console.error(`[pages-mirror] mismatch: ${mismatches.join(', ')}`);
    process.exit(1);
  }
  console.log(`[pages-mirror] root mirror matches all ${current.length} public files.`);
  process.exit(0);
}

for (const relative of previous) {
  if (current.includes(relative)) continue;
  await rm(path.join(ROOT, relative), { force: true });
}
for (const relative of current) {
  const source = path.join(PUBLIC, relative);
  const target = path.join(ROOT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}
await writeFile(MANIFEST, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
await writeFile(path.join(ROOT, '.nojekyll'), '', 'utf8');
console.log(`[pages-mirror] synced ${current.length} public files to repository root for legacy Pages parity.`);
