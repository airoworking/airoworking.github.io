import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.resolve('public');
const CHECK = process.argv.includes('--check');
const MASCOT_FILE = 'assets/brand/mascot-character.webp';

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(absolute);
  }
  return files.sort();
}

function pagePrefix(file) {
  const relative = path.relative(PUBLIC, file);
  const depth = relative.split(path.sep).length - 1;
  return depth ? '../'.repeat(depth) : './';
}

function patchHeader(html, asset) {
  const mascot = `<span class="brand-avatar" aria-hidden="true"><img src="${asset}" alt="" width="640" height="640" decoding="async"></span>`;
  if (html.includes('class="brand-avatar"')) {
    return html.replace(/(<span class="brand-avatar"[^>]*><img src=")[^"]+("[^>]*><\/span>)/, `$1${asset}$2`);
  }
  return html.replace(/<a class="brand" href="([^"]+)">([^<]+)<\/a>/, `<a class="brand" href="$1">${mascot}<span class="brand-label">$2</span></a>`);
}

function patchHead(html, prefix, asset) {
  const css = `${prefix}brand.css`;
  let next = html;
  if (!next.includes(`href="${css}"`)) next = next.replace('</head>', `<link rel="stylesheet" href="${css}"></head>`);
  if (!/rel="(?:icon|shortcut icon)"/.test(next)) {
    next = next.replace('</head>', `<link rel="icon" href="${asset}" type="image/webp"></head>`);
  }
  return next;
}

const files = await filesUnder(PUBLIC);
const failures = [];
let changed = 0;

for (const file of files) {
  const prefix = pagePrefix(file);
  const asset = `${prefix}${MASCOT_FILE}`;
  const original = await readFile(file, 'utf8');
  let html = patchHead(original, prefix, asset);
  html = patchHeader(html, asset);

  const valid = html.includes('class="brand-avatar"') &&
    html.includes(`src="${asset}"`) &&
    html.includes(`href="${prefix}brand.css"`) &&
    /rel="(?:icon|shortcut icon)"/.test(html);
  if (!valid) failures.push(path.relative(PUBLIC, file));

  if (!CHECK && html !== original) {
    await writeFile(file, html, 'utf8');
    changed += 1;
  }
}

if (failures.length) {
  console.error(`[mascot] missing mascot header/favicon wiring: ${failures.join(', ')}`);
  process.exit(1);
}

console.log(`[mascot] ${CHECK ? 'verified' : 'applied'} mascot identity across ${files.length} HTML pages${CHECK ? '' : `; ${changed} changed`}.`);
