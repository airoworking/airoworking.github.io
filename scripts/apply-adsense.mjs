import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const CONFIG = path.join(ROOT, 'config', 'adsense.json');
const CHECK = process.argv.includes('--check');

async function htmlFilesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFilesUnder(absolute));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(absolute);
  }
  return files.sort();
}

const settings = JSON.parse(await readFile(CONFIG, 'utf8'));
const client = String(process.env.ADSENSE_CLIENT || settings.client || '').trim();
if (!/^ca-pub-\d+$/.test(client)) {
  throw new Error(`Invalid AdSense client id: ${client || '(empty)'}`);
}

const loader = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>`;
const loaderPattern = /<script\b[^>]*pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-\d+[^>]*>\s*<\/script>/gi;
const files = await htmlFilesUnder(PUBLIC);
const failures = [];
let changed = 0;

for (const file of files) {
  const original = await readFile(file, 'utf8');
  const withoutLoader = original.replace(loaderPattern, '');
  if (!withoutLoader.includes('</head>')) {
    failures.push(`${path.relative(ROOT, file)} (missing </head>)`);
    continue;
  }
  const next = withoutLoader.replace('</head>', `${loader}</head>`);

  if (CHECK) {
    const matches = next.match(loaderPattern) || [];
    if (matches.length !== 1 || !matches[0].includes(`client=${client}`) || original !== next) {
      failures.push(path.relative(ROOT, file));
    }
    continue;
  }

  if (next !== original) {
    await writeFile(file, next, 'utf8');
    changed += 1;
  }
}

if (failures.length) {
  console.error(`[adsense] verification failed: ${failures.join(', ')}`);
  process.exit(1);
}

if (CHECK) {
  console.log(`[adsense] verified ${files.length} HTML pages contain exactly one loader for ${client}.`);
} else {
  console.log(`[adsense] applied ${client} to ${files.length} HTML pages; changed ${changed}.`);
}
