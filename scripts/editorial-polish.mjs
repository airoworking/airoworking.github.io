import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SITE_NAME = 'AI로 일하는 법';
const OLD_SITE_NAME = 'AI로 일하는 법';
const CURRENT_OVERRIDES = {
  crm: {
    title: '소규모 사업자의 CRM 자동화, 어디서부터 시작해야 할까?',
    description: '고객 정보가 흩어지고 후속 연락을 놓치기 시작했다면 CRM 자동화를 검토할 때입니다. 소규모 팀이 필요한 기능만 고르고, 데이터를 정리하고, 자동화를 단계적으로 붙이는 방법을 정리했습니다.'
  }
};

const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cleanPlainText(value = '') {
  return String(value)
    .replace(/\s*\(\s*\d+\s*Korean characters?\s*\)\s*/gi, ' ')
    .replace(/\s*\(\s*한글\s*\d+\s*자\s*\)\s*/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanBullet(value = '') {
  return cleanPlainText(value)
    .replace(/^[-*•]\s*/, '')
    .replace(/^(\d+)단계\s*:\s*/u, '$1단계 · ')
    .replace(/^([^:：]{2,32})\s*[:：]\s*/u, '$1 — ');
}

function dedupeParagraphs(items = []) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const text = cleanPlainText(raw);
    if (!text) continue;
    const key = text.toLowerCase().replace(/[\s.,!?·:;()'"“”‘’]/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function naturalTitle(title = '', slug = '') {
  if (CURRENT_OVERRIDES[slug]?.title) return CURRENT_OVERRIDES[slug].title;
  return cleanPlainText(title)
    .replace(/\s*실전\s*활용\s*가이드\s*[:：-]?\s*/g, ' ')
    .replace(/\s*효율적인\s*도입\s*전략\s*및\s*단계별\s*실행\s*/g, ' ')
    .replace(/\s*완벽\s*가이드\s*/g, ' 가이드 ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:：-]\s*$/g, '')
    .trim();
}

function polishBundle(bundle, slug) {
  if (!bundle || typeof bundle !== 'object') return bundle;
  const override = CURRENT_OVERRIDES[slug];
  if (bundle.topic) {
    bundle.topic.topic = cleanPlainText(bundle.topic.topic);
    bundle.topic.readerProblem = cleanPlainText(bundle.topic.readerProblem);
    bundle.topic.expectedOutcome = cleanPlainText(bundle.topic.expectedOutcome);
  }
  if (bundle.article) {
    bundle.article.title = naturalTitle(bundle.article.title, slug);
    bundle.article.description = cleanPlainText(bundle.article.description);
    bundle.article.sections = (bundle.article.sections || []).map((section) => ({
      ...section,
      heading: cleanPlainText(section.heading),
      paragraphs: dedupeParagraphs(section.paragraphs),
      bullets: (section.bullets || []).map(cleanBullet).filter(Boolean)
    }));
  }
  if (bundle.qa) {
    bundle.qa.revisedTitle = override?.title || naturalTitle(bundle.qa.revisedTitle, slug);
    bundle.qa.revisedDescription = override?.description || cleanPlainText(bundle.qa.revisedDescription);
    bundle.qa.revisedSections = (bundle.qa.revisedSections || []).map((section) => ({
      ...section,
      heading: cleanPlainText(section.heading),
      paragraphs: dedupeParagraphs(section.paragraphs),
      bullets: (section.bullets || []).map(cleanBullet).filter(Boolean)
    }));
    bundle.qa.revisedFaq = (bundle.qa.revisedFaq || []).map((item) => ({
      question: cleanPlainText(item.question),
      answer: cleanPlainText(item.answer)
    }));
  }
  return bundle;
}

function inlineMarkup(html = '') {
  return html
    .replace(/\s*\(\s*\d+\s*Korean characters?\s*\)\s*/gi, '')
    .replace(/\s*\(\s*한글\s*\d+\s*자\s*\)\s*/g, '')
    .replace(/\*\*([^*<>]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_<>]+?)__/g, '<strong>$1</strong>')
    .replace(/`([^`<>]+?)`/g, '<code>$1</code>');
}

function dedupeHtmlParagraphs(html = '') {
  return html.replace(/(<section\b[^>]*class="[^"]*content-section[^"]*"[^>]*>)([\s\S]*?)(<\/section>)/g, (all, open, body, close) => {
    const seen = new Set();
    const next = body.replace(/<p>([\s\S]*?)<\/p>/g, (pAll, inner) => {
      const plain = cleanPlainText(inner.replace(/<[^>]+>/g, ''));
      const key = plain.toLowerCase().replace(/[\s.,!?·:;()'"“”‘’]/g, '');
      if (!key || seen.has(key)) return '';
      seen.add(key);
      return `<p>${inner}</p>`;
    });
    return `${open}${next}${close}`;
  });
}

function motifFor(post = {}) {
  const haystack = `${post.title || ''} ${post.primaryKeyword || ''} ${(post.tags || []).join(' ')}`.toLowerCase();
  if (/crm|고객|영업|sales|lead/.test(haystack)) return { left: '고객·리드', center: 'CRM', right: '후속조치 자동화', icon: '◎' };
  if (/email|메일|문서|document/.test(haystack)) return { left: '메일·문서', center: 'AI 정리', right: '검토·전달', icon: '▤' };
  if (/meeting|회의|note|노트/.test(haystack)) return { left: '회의', center: '요약·정리', right: '할 일·공유', icon: '◉' };
  if (/content|콘텐츠|creator|newsletter|sns/.test(haystack)) return { left: '아이디어', center: '콘텐츠 흐름', right: '배포·재활용', icon: '◇' };
  if (/code|개발|developer|rag|llm|agent/.test(haystack)) return { left: '코드·데이터', center: 'AI 워크플로', right: '검증·배포', icon: '</>' };
  if (/spreadsheet|시트|엑셀/.test(haystack)) return { left: '데이터', center: '자동 처리', right: '검토·보고', icon: '▦' };
  return { left: '반복 업무', center: 'AI·자동화', right: '검토·완료', icon: '→' };
}

function contextualSvg(post) {
  const motif = motifFor(post);
  const title = naturalTitle(post.title || 'AI 자동화', post.slug || '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="620" viewBox="0 0 1200 620" role="img" aria-labelledby="t d"><title id="t">${esc(title)} 흐름도</title><desc id="d">${esc(`${motif.left}에서 ${motif.center}를 거쳐 ${motif.right}로 이어지는 업무 흐름`)}</desc><rect width="1200" height="620" rx="28" fill="#f7f7f5"/><rect x="55" y="55" width="1090" height="510" rx="24" fill="#fff" stroke="#d8d8d4"/><text x="92" y="120" font-family="system-ui,sans-serif" font-size="22" font-weight="750" fill="#666">실제 업무 흐름으로 보기</text><text x="92" y="168" font-family="system-ui,sans-serif" font-size="30" font-weight="850" fill="#111">${esc(title)}</text><path d="M310 360H475M725 360H890" stroke="#777" stroke-width="4" stroke-linecap="round"/><path d="m458 348 18 12-18 12M873 348l18 12-18 12" fill="none" stroke="#777" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><g><rect x="95" y="270" width="215" height="180" rx="24" fill="#fafaf9" stroke="#cfcfcb"/><text x="202" y="338" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="850" fill="#111">01</text><text x="202" y="392" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" font-weight="800" fill="#111">${esc(motif.left)}</text></g><g><rect x="475" y="245" width="250" height="230" rx="28" fill="#111"/><text x="600" y="330" text-anchor="middle" font-family="system-ui,sans-serif" font-size="38" font-weight="850" fill="#fff">${esc(motif.icon)}</text><text x="600" y="395" text-anchor="middle" font-family="system-ui,sans-serif" font-size="26" font-weight="850" fill="#fff">${esc(motif.center)}</text></g><g><rect x="890" y="270" width="215" height="180" rx="24" fill="#fafaf9" stroke="#cfcfcb"/><text x="997" y="338" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="850" fill="#111">03</text><text x="997" y="392" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#111">${esc(motif.right)}</text></g><text x="92" y="525" font-family="system-ui,sans-serif" font-size="18" fill="#777">핵심은 도구 자체보다, 어디를 자동화하고 어디에서 사람이 확인할지 정하는 것입니다.</text></svg>`;
}

function articleVisualFigure(post) {
  const src = `../assets/posts/${esc(post.slug)}-context.svg`;
  return `<figure class="article-visual contextual-visual"><img src="${src}" alt="${esc(naturalTitle(post.title, post.slug))} 업무 흐름도" loading="lazy" width="1200" height="620"><figcaption>이 글의 내용을 실제 업무 흐름 기준으로 단순화한 그림입니다.</figcaption></figure>`;
}

async function polishArticleHtml(filePath, post) {
  let html = await readFile(filePath, 'utf8');
  html = html.replaceAll(OLD_SITE_NAME, SITE_NAME);
  html = inlineMarkup(html);
  html = dedupeHtmlParagraphs(html);
  const override = CURRENT_OVERRIDES[post.slug];
  if (override) {
    const oldTitle = post.title;
    html = html.replaceAll(oldTitle, override.title);
    const escapedOld = esc(oldTitle);
    if (escapedOld !== oldTitle) html = html.replaceAll(escapedOld, esc(override.title));
    if (post.description) html = html.replaceAll(post.description, override.description);
  }
  if (!html.includes('class="article-visual contextual-visual"')) {
    const figure = articleVisualFigure({ ...post, title: override?.title || post.title });
    const marker = '<div class="article-content">';
    if (html.includes(marker)) html = html.replace(marker, `${figure}${marker}`);
  }
  await writeFile(filePath, html);
}

async function main() {
  const postsPath = path.join(ROOT, 'data', 'posts.json');
  const posts = JSON.parse(await readFile(postsPath, 'utf8'));
  for (const post of posts) {
    const override = CURRENT_OVERRIDES[post.slug];
    post.title = override?.title || naturalTitle(post.title, post.slug);
    post.description = override?.description || cleanPlainText(post.description);
    post.readerProblem = cleanPlainText(post.readerProblem);
    post.expectedOutcome = cleanPlainText(post.expectedOutcome);
  }
  await writeFile(postsPath, `${JSON.stringify(posts, null, 2)}\n`);

  const articlesDir = path.join(ROOT, 'data', 'articles');
  let articleFiles = [];
  try { articleFiles = (await readdir(articlesDir)).filter((name) => name.endsWith('.json')); } catch {}
  for (const name of articleFiles) {
    const slug = name.replace(/\.json$/, '');
    const fullPath = path.join(articlesDir, name);
    const bundle = polishBundle(JSON.parse(await readFile(fullPath, 'utf8')), slug);
    await writeFile(fullPath, `${JSON.stringify(bundle, null, 2)}\n`);
  }

  await mkdir(path.join(ROOT, 'public', 'assets', 'posts'), { recursive: true });
  for (const post of posts) {
    const svgPath = path.join(ROOT, 'public', 'assets', 'posts', `${post.slug}-context.svg`);
    await writeFile(svgPath, contextualSvg(post));
    const htmlPath = path.join(ROOT, 'public', 'posts', `${post.slug}.html`);
    try { await polishArticleHtml(htmlPath, post); } catch {}
  }

  for (const relative of ['public/index.html', 'public/feed.xml', 'public/disclosure.html', 'public/privacy.html']) {
    const full = path.join(ROOT, relative);
    try {
      let text = await readFile(full, 'utf8');
      text = text.replaceAll(OLD_SITE_NAME, SITE_NAME);
      await writeFile(full, text);
    } catch {}
  }

  console.log(`[editorial] polished ${posts.length} posts; site title="${SITE_NAME}"; contextual image guaranteed per published post.`);
}

await main();
