import { readFile, stat } from 'node:fs/promises';

const html = await readFile('public/index.html', 'utf8');
const article = await readFile('public/posts/crm.html', 'utf8');
const [css, cssBase] = await Promise.all([
  readFile('public/brand.css', 'utf8'),
  readFile('public/brand-original.css', 'utf8')
]);
const brandCss = `${cssBase}\n${css}`;
const interactions = await readFile('public/interactions.js', 'utf8');
const bannerPath = 'public/assets/brand/hero-static-hq.avif';
const mascotPath = 'public/assets/brand/mascot-character.webp';
const [banner, mascot] = await Promise.all([stat(bannerPath), stat(mascotPath)]);
const [bannerBytes, mascotBytes] = await Promise.all([readFile(bannerPath), readFile(mascotPath)]);

for (const required of [
  'data-brand-patched="v9"',
  'class="hero brand-hero"',
  'class="brand-banner-image-wrap"',
  'class="brand-banner-image"',
  'src="./assets/brand/hero-static-hq.avif?v=9"',
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

if (banner.size < 70_000) throw new Error(`Static hero AVIF looks unexpectedly small (${banner.size} bytes).`);
if (bannerBytes.subarray(4, 12).toString('ascii') !== 'ftypavif') throw new Error('Static hero is not a valid AVIF container.');
const ispeIndex = bannerBytes.indexOf(Buffer.from('ispe'));
if (ispeIndex < 0) throw new Error('Static hero AVIF is missing image dimensions.');
const bannerWidth = bannerBytes.readUInt32BE(ispeIndex + 8);
const bannerHeight = bannerBytes.readUInt32BE(ispeIndex + 12);
if (bannerWidth !== 2048 || bannerHeight !== 682) throw new Error(`Static hero dimensions mismatch: ${bannerWidth}x${bannerHeight}.`);

for (const required of [
  '.brand-banner-image-wrap{',
  '.brand-banner-image{',
  '.mascot-float{',
  '.mascot-float-link{',
  '.mascot-float-bubble{',
  '.mascot-float-avatar{',
  '.audience-icon{',
  '.effects-ready .reveal-target{',
  '.effects-ready .reveal-target.is-revealed{',
  '@media(max-width:800px)',
  '@media(max-width:480px)'
]) {
  if (!brandCss.includes(required)) throw new Error(`Brand CSS missing ${required}`);
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
if (brandCss.includes('.mascot-stage{') || brandCss.includes('.mascot-hero{') || brandCss.includes('.mascot-guide{')) throw new Error('Legacy hero-sized or full-width mascot CSS must not remain.');

console.log(`Brand policy OK: high-quality static banner remains the hero, mascot peeks from the right edge with subtle motion, and responsive/reduced-motion behavior is enforced.`);
