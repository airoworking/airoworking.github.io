import { mkdir, readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2] || 'public/index.html';
const highResBannerPath = 'public/assets/brand/hero-banner-2048.avif';
const mascotPath = 'public/assets/brand/mascot-character.webp';
const bannerParts = Array.from({ length: 6 }, (_, index) => `brand-assets/hero-banner-2048.part${index + 1}.b64`);
const mascotParts = Array.from({ length: 5 }, (_, index) => `brand-assets/mascot-character.part${index + 1}.b64`);

const icons = {
  'knowledge-worker': `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="7" y="12" width="31" height="36" rx="11"/><path d="M22 12V7m-4 0h8"/><circle cx="18" cy="29" r="2.5" class="fill"/><circle cx="28" cy="29" r="2.5" class="fill"/><path d="M17 38c4 3 8 3 12 0"/><rect x="37" y="18" width="20" height="34" rx="5"/><path d="m42 28 3 3 6-7M42 39h10M42 45h8"/></svg>`,
  'small-business': `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="19" width="36" height="31" rx="7"/><path d="M18 19v-6h16v6M8 30c10 6 26 6 36 0M24 31v6h5v-6"/><path d="M47 44V28m0 0 5 5m-5-5-6 7"/><circle cx="48" cy="14" r="5" class="fill-soft"/></svg>`,
  freelancer: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="12" width="38" height="39" rx="8"/><path d="M17 8v9M36 8v9M8 22h38"/><circle cx="20" cy="33" r="2.5" class="fill"/><circle cx="33" cy="33" r="2.5" class="fill"/><path d="M20 41c4 3 9 3 13 0"/><path d="M49 30c5 1 8 5 8 10v11H43V40c0-5 2-8 6-10Z"/><path d="m47 41 3 3 4-5"/></svg>`,
  creator: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 9h28l10 10v36H11z"/><path d="M39 9v11h10M19 31h15M19 38h12"/><path d="m38 43 12-12 5 5-12 12-7 2z"/><path d="M19 48h9"/><circle cx="17" cy="15" r="3" class="fill-soft"/></svg>`,
  developer: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="11" width="42" height="33" rx="6"/><path d="M6 19h42M17 28l-5 5 5 5M34 28l5 5-5 5M28 26l-4 14"/><rect x="40" y="36" width="18" height="19" rx="5"/><path d="M45 42h8M49 38v-5M49 55v4M40 45h-4M58 45h4M45 50h8"/></svg>`
};

async function decodeParts(parts, output, kind) {
  const chunks = await Promise.all(parts.map(async (path) => (await readFile(path, 'utf8')).trim()));
  const binary = Buffer.from(chunks.join(''), 'base64');
  await mkdir('public/assets/brand', { recursive: true });
  if (kind === 'avif') {
    if (binary.length < 16_000 || binary.subarray(4, 12).toString('ascii') !== 'ftypavif') throw new Error(`Invalid AVIF brand source for ${output}.`);
  } else if (kind === 'webp') {
    if (binary.length < 10_000 || binary.subarray(0, 4).toString('ascii') !== 'RIFF' || binary.subarray(8, 12).toString('ascii') !== 'WEBP') throw new Error(`Invalid WebP mascot source for ${output}.`);
  }
  await writeFile(output, binary);
  console.log(`[brand] built ${output} (${binary.length} bytes)`);
}

function heroHtml(html) {
  const secondaryHref = html.includes('id="launch"') ? '#launch' : '#commercial';
  const secondaryLabel = html.includes('id="launch"') ? '발행 준비 상태 보기' : 'AI 도구 비교 보기';
  const srcset = './assets/brand/hero-banner.avif 800w, ./assets/brand/hero-banner-2048.avif 2048w';
  const sizes = '(max-width: 800px) calc(100vw - 32px), 1200px';
  return `<section class="hero brand-hero" aria-labelledby="hero-title"><h1 id="hero-title" class="hero-sr-only">실무에 바로 쓰는 AI 자동화 가이드</h1><div class="brand-banner-image-wrap"><picture><source type="image/avif" srcset="${srcset}" sizes="${sizes}"><img class="brand-banner-image" src="./assets/brand/hero-banner-2048.avif" srcset="${srcset}" sizes="${sizes}" width="2048" height="682" alt="실무에 바로 쓰는 AI 자동화. 업무 자동화, 비즈니스 자동화, AI 도구 활용법을 한눈에 소개하는 실무 가이드 배너" fetchpriority="high" decoding="async"></picture></div><div class="hero-copy"><div class="hero-actions"><a class="button button-primary" href="#audiences">분야별 가이드 보기</a><a class="button button-secondary" href="${secondaryHref}">${secondaryLabel}</a></div></div></section>`;
}

function mascotFloatHtml() {
  return `<aside class="mascot-float" aria-label="추천 글 안내"><a class="mascot-float-link" href="#featured"><span class="mascot-float-bubble">처음이라면 추천 글부터 <span aria-hidden="true">→</span></span><span class="mascot-float-avatar" aria-hidden="true"><img src="./assets/brand/mascot-character.webp" alt="" width="640" height="640" decoding="async"></span></a></aside>`;
}

function injectIcon(html, id) {
  if (html.includes(`data-audience-icon="${id}"`)) return html;
  const icon = `<span class="audience-icon" data-audience-icon="${id}" aria-hidden="true">${icons[id]}</span>`;
  const idPattern = new RegExp(`(<a[^>]*id="audience-${id}"[^>]*class="audience-card"[^>]*>)`);
  if (idPattern.test(html)) return html.replace(idPattern, `$1${icon}`);
  const hrefPattern = new RegExp(`(<a[^>]*class="audience-card"[^>]*href="#audience-${id}"[^>]*>)`);
  return html.replace(hrefPattern, `$1${icon}`);
}

await decodeParts(bannerParts, highResBannerPath, 'avif');
await decodeParts(mascotParts, mascotPath, 'webp');

let html = await readFile(target, 'utf8');
html = html.replace(/\sdata-brand-patched="v[23456789]"/g, '');
html = html.replace('<body>', '<body data-brand-patched="v9">');

if (!html.includes('href="./brand.css"')) html = html.replace('</head>', '<link rel="stylesheet" href="./brand.css"></head>');

html = html.replace(/<aside class="mascot-(?:guide|float)"[\s\S]*?<\/aside>/g, '');
const heroPattern = /<section class="hero(?: brand-hero)?(?: mascot-hero)?"[^>]*>[\s\S]*?<\/section>/;
if (!heroPattern.test(html)) throw new Error('Could not find homepage hero section for brand patch.');
html = html.replace(heroPattern, `${heroHtml(html)}${mascotFloatHtml()}`);

for (const id of Object.keys(icons)) html = injectIcon(html, id);
if (!html.includes('src="./interactions.js"')) html = html.replace('</body>', '<script src="./interactions.js" defer></script></body>');

await writeFile(target, html);
console.log(`[brand] restored banner-first hero, placed mascot as a small floating side guide, and applied ${Object.keys(icons).length} audience icons to ${target}`);
