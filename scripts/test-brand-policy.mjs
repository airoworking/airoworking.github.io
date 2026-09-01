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
  'data-brand-patched="v7"',
  'class="hero brand-hero mascot-hero"',
  'class="mascot-hero-copy"',
  'class="mascot-kicker">AI 업무 파트너',
  'class="mascot-title">AI로 일하는 법',
  'class="mascot-lede"',
  'class="mascot-stage"',
  'class="mascot-character"',
  'src="./assets/brand/mascot-character.webp"',
  'width="640" height="640"',
  'class="mascot-note"',
  '복잡한 AI를 일의 언어로.',
  'class="brand-avatar"',
  'href="./brand.css"',
  'src="./interactions.js" defer',
  'data-audience-icon="knowledge-worker"',
  'data-audience-icon="small-business"',
  'data-audience-icon="freelancer"',
  'data-audience-icon="creator"',
  'data-audience-icon="developer"'
]) {
  if (!html.includes(required)) throw new Error(`Mascot brand patch missing ${required}`);
}

for (const required of [
  'class="brand-avatar"',
  'src="../assets/brand/mascot-character.webp"',
  'href="../brand.css"',
  'rel="icon" href="../assets/brand/mascot-character.webp"'
]) {
  if (!article.includes(required)) throw new Error(`Article mascot identity missing ${required}`);
}

if (mascot.size < 10_000) throw new Error(`Mascot WebP looks unexpectedly small (${mascot.size} bytes).`);
if (mascotBytes.subarray(0, 4).toString('ascii') !== 'RIFF' || mascotBytes.subarray(8, 12).toString('ascii') !== 'WEBP') {
  throw new Error('Mascot asset is not a valid WebP container.');
}

if (banner.size < 16_000) throw new Error(`High-resolution banner asset looks unexpectedly small (${banner.size} bytes).`);
const ispeIndex = bannerBytes.indexOf(Buffer.from('ispe'));
if (ispeIndex < 0) throw new Error('Could not find AVIF image spatial extents (ispe).');
const width = bannerBytes.readUInt32BE(ispeIndex + 8);
const height = bannerBytes.readUInt32BE(ispeIndex + 12);
if (width !== 2048 || height !== 682) throw new Error(`Expected 2048x682 retained banner asset, found ${width}x${height}.`);

if (html.includes('class="brand-banner-image-wrap"')) throw new Error('Legacy banner hero should not remain after mascot conversion.');
if (html.includes('class="brand-banner-art"')) throw new Error('Legacy inline SVG hero art should not be present.');
if (html.includes('data:image/png;base64,')) throw new Error('Homepage must use repository mascot assets, not inline base64 payloads.');

const iconCount = (html.match(/data-audience-icon=/g) || []).length;
if (iconCount !== 5) throw new Error(`Expected exactly 5 audience icons, found ${iconCount}`);

for (const required of [
  '.hero::before{content:none!important',
  '.mascot-hero{display:grid!important',
  '.mascot-hero-copy{position:relative',
  '.mascot-title{position:static!important',
  '.mascot-stage{--pointer-x:50%',
  '.mascot-character{position:relative',
  '.mascot-note{position:absolute',
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
  "document.querySelector('.mascot-stage')",
  "IntersectionObserver",
  "root.classList.add('effects-ready')",
  "classList.add('is-revealed')",
  "window.addEventListener('scroll', updateHeader, { passive: true })",
  "hero.addEventListener('pointermove'"
]) {
  if (!interactions.includes(required)) throw new Error(`Interaction layer missing ${required}`);
}

if (interactions.includes('setInterval(')) throw new Error('Interaction layer must not use continuous timers.');

console.log(`Brand policy OK: ${mascot.size}-byte mascot WebP drives the responsive hero and all-page identity; five audience icons, progressive interactions, reduced-motion support, and retained high-resolution banner source are enforced.`);
