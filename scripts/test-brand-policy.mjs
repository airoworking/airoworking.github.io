import { readFile, stat } from 'node:fs/promises';

const html = await readFile('public/index.html', 'utf8');
const article = await readFile('public/posts/crm.html', 'utf8');
const css = await readFile('public/brand.css', 'utf8');
const interactions = await readFile('public/interactions.js', 'utf8');
const bannerPath = 'public/assets/brand/hero-banner-2048.avif';
const mascotPath = 'public/assets/brand/mascot-character.webp';
const [banner, mascot] = await Promise.all([stat(bannerPath), stat(mascotPath)]);
const [bannerBytes, mascotBytes] = await Promise.all([readFile(bannerPath), readFile(mascotPath)]);

for (const required of [
  'data-brand-patched="v9"',
  'class="hero brand-hero"',
  'class="brand-banner-image-wrap"',
  'class="brand-banner-image"',
  'src="./assets/brand/hero-banner-2048.avif"',
  './assets/brand/hero-banner.avif 800w, ./assets/brand/hero-banner-2048.avif 2048w',
  'width="2048" height="682"',
  'class="mascot-float"',
  'class="mascot-float-link"',
  'class="mascot-float-bubble"',
  'class="mascot-float-avatar"',
  '처음이라면 추천 글부터',
  'src="./assets/brand/mascot-character.webp"',
  'class="brand-avatar"',
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

for (const required of [
  'class="brand-avatar"',
  'src="../assets/brand/mascot-character.webp"',
  'href="../brand.css"',
  'rel="icon" href="../assets/brand/mascot-character.webp"'
]) {
  if (!article.includes(required)) throw new Error(`Article mascot identity missing ${required}`);
}

if (html.includes('class="hero brand-hero mascot-hero"') || html.includes('class="mascot-stage"') || html.includes('class="mascot-character"')) {
  throw new Error('Mascot must not occupy the homepage banner/hero stage.');
}
if (html.includes('class="mascot-guide"')) throw new Error('Legacy full-width mascot guide must not remain.');

if (mascot.size < 10_000) throw new Error(`Mascot WebP looks unexpectedly small (${mascot.size} bytes).`);
if (mascotBytes.subarray(0, 4).toString('ascii') !== 'RIFF' || mascotBytes.subarray(8, 12).toString('ascii') !== 'WEBP') throw new Error('Mascot asset is not a valid WebP container.');

if (banner.size < 16_000) throw new Error(`High-resolution banner asset looks unexpectedly small (${banner.size} bytes).`);
const ispeIndex = bannerBytes.indexOf(Buffer.from('ispe'));
if (ispeIndex < 0) throw new Error('Could not find AVIF image spatial extents (ispe).');
const width = bannerBytes.readUInt32BE(ispeIndex + 8);
const height = bannerBytes.readUInt32BE(ispeIndex + 12);
if (width !== 2048 || height !== 682) throw new Error(`Expected 2048x682 banner, found ${width}x${height}.`);

if (html.includes('class="brand-banner-art"')) throw new Error('Legacy inline SVG hero art should not be present.');
if (html.includes('data:image/png;base64,')) throw new Error('Homepage must use repository assets, not inline base64 payloads.');

const iconCount = (html.match(/data-audience-icon=/g) || []).length;
if (iconCount !== 5) throw new Error(`Expected exactly 5 audience icons, found ${iconCount}`);

for (const required of [
  '.hero::before{content:none!important',
  '.brand-banner-image-wrap picture{display:block;width:100%}',
  '.brand-banner-image{display:block;width:100%;max-width:100%;height:auto;object-fit:contain',
  '.mascot-float{position:fixed',
  '.mascot-float-link{display:flex',
  '.mascot-float-avatar{position:relative',
  '.mascot-float-bubble{position:relative',
  '@keyframes mascot-float-drift',
  '.brand-avatar{position:relative',
  '.brand-avatar img{position:absolute',
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
  "document.querySelector('.brand-banner-image-wrap')",
  "document.querySelectorAll('.home-section, .launch-note",
  "IntersectionObserver",
  "root.classList.add('effects-ready')",
  "classList.add('is-revealed')",
  "window.addEventListener('scroll', updateHeader, { passive: true })",
  "hero.addEventListener('pointermove'"
]) {
  if (!interactions.includes(required)) throw new Error(`Interaction layer missing ${required}`);
}

if (interactions.includes('setInterval(')) throw new Error('Interaction layer must not use continuous timers.');
if (css.includes('.mascot-stage{') || css.includes('.mascot-hero{') || css.includes('.mascot-guide{')) throw new Error('Legacy hero-sized or full-width mascot CSS must not remain.');

console.log(`Brand policy OK: banner remains the hero, mascot is a small floating side guide/header identity, all-page favicon wiring remains, and responsive/reduced-motion behavior is enforced.`);
