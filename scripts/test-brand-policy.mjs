import { readFile, stat } from 'node:fs/promises';

const html = await readFile('public/index.html', 'utf8');
const css = await readFile('public/brand.css', 'utf8');
const interactions = await readFile('public/interactions.js', 'utf8');
const bannerPath = 'public/assets/brand/hero-banner-2048.avif';
const banner = await stat(bannerPath);
const bannerBytes = await readFile(bannerPath);

for (const required of [
  'data-brand-patched="v6"',
  'class="brand-banner-image-wrap"',
  '<picture>',
  'class="brand-banner-image"',
  'src="./assets/brand/hero-banner-2048.avif"',
  './assets/brand/hero-banner.avif 800w, ./assets/brand/hero-banner-2048.avif 2048w',
  'sizes="(max-width: 800px) calc(100vw - 32px), 1200px"',
  'width="2048" height="682"',
  'href="./brand.css"',
  'src="./interactions.js" defer',
  'data-audience-icon="knowledge-worker"',
  'data-audience-icon="small-business"',
  'data-audience-icon="freelancer"',
  'data-audience-icon="creator"',
  'data-audience-icon="developer"'
]) {
  if (!html.includes(required)) throw new Error(`Brand patch missing ${required}`);
}

if (banner.size < 16_000) throw new Error(`High-resolution banner asset looks unexpectedly small (${banner.size} bytes).`);
const ispeIndex = bannerBytes.indexOf(Buffer.from('ispe'));
if (ispeIndex < 0) throw new Error('Could not find AVIF image spatial extents (ispe).');
const width = bannerBytes.readUInt32BE(ispeIndex + 8);
const height = bannerBytes.readUInt32BE(ispeIndex + 12);
if (width !== 2048 || height !== 682) throw new Error(`Expected 2048x682 high-resolution banner, found ${width}x${height}.`);

if (html.includes('width="800" height="267"')) throw new Error('Homepage must not use the old 800px banner as the primary source.');
if (html.includes('class="brand-banner-art"')) throw new Error('Legacy inline SVG hero art should not be present.');
if (html.includes('data:image/png;base64,')) throw new Error('Homepage banner must use repository assets, not an inline base64 payload.');

const iconCount = (html.match(/data-audience-icon=/g) || []).length;
if (iconCount !== 5) throw new Error(`Expected exactly 5 audience icons, found ${iconCount}`);

for (const required of [
  '.hero::before{content:none!important',
  '.brand-banner-image-wrap picture{display:block;width:100%}',
  '.brand-banner-image{display:block;width:100%;max-width:100%;height:auto;object-fit:contain',
  '.brand-banner-image-wrap::after',
  '.audience-card:hover',
  '.primary-nav a::after',
  '.effects-ready .reveal-target',
  '@media(hover:none),(pointer:coarse)',
  '@media(prefers-reduced-motion:reduce)',
  '.audience-card{display:grid!important',
  '.audience-icon{grid-area:icon',
  '@media(max-width:800px)',
  '@media(max-width:480px)'
]) {
  if (!css.includes(required)) throw new Error(`Brand CSS missing ${required}`);
}

for (const required of [
  "matchMedia('(prefers-reduced-motion: reduce)')",
  "matchMedia('(hover: hover) and (pointer: fine)')",
  "IntersectionObserver",
  "root.classList.add('effects-ready')",
  "classList.add('is-revealed')",
  "window.addEventListener('scroll', updateHeader, { passive: true })",
  "hero.addEventListener('pointermove'"
]) {
  if (!interactions.includes(required)) throw new Error(`Interaction layer missing ${required}`);
}

if (interactions.includes('setInterval(')) throw new Error('Interaction layer must not use continuous timers.');
if (css.includes('aspect-ratio:3/1')) throw new Error('Banner CSS must preserve the source image ratio instead of forcing a low-resolution aspect box.');

console.log(`Brand policy OK: responsive 2048x682 AVIF banner (${banner.size} bytes), five unified icons, subtle progressive interactions, reduced-motion support, and mobile layout are enforced.`);
