export const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function slugId(value, fallback = 'section') {
  const id = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return id || fallback;
}

function roleLabel(role) {
  return ({ reach: '실용 가이드', commercial: '도구 선택', authority: '심화 가이드' })[role] || '가이드';
}

function audienceLabel(config, id) {
  return config.research?.audienceSegments?.find((segment) => segment.id === id)?.label ||
    (id === 'general' ? '일반 독자' : id || '일반 독자');
}

function audienceShortLabel(id) {
  return ({
    'knowledge-worker': '업무 자동화',
    'small-business': '소규모 비즈니스',
    freelancer: '프리랜서',
    creator: '크리에이터',
    developer: '개발자'
  })[id] || 'AI 자동화';
}

function audienceDescription(id) {
  return ({
    'knowledge-worker': '이메일·문서·회의·스프레드시트 반복업무를 줄이는 방법',
    'small-business': '고객응대·예약·CRM·마케팅 운영을 더 가볍게 만드는 방법',
    freelancer: '고객관리·견적·리서치·행정 업무를 자동화하는 방법',
    creator: '기획·콘텐츠 재활용·뉴스레터·SNS 워크플로를 효율화하는 방법',
    developer: 'AI 코딩·로컬 LLM·RAG·개발 워크플로를 깊이 있게 다루는 가이드'
  })[id] || '실용적인 AI와 자동화 가이드';
}

function siteHeader(config, prefix = './') {
  const home = prefix;
  return `<a class="skip-link" href="#main-content">본문으로 건너뛰기</a><header class="site-header"><div class="header-inner"><a class="brand" href="${home}">${esc(config.site.name)}</a><nav class="primary-nav" aria-label="주요 메뉴"><a href="${home}#audience-knowledge-worker">업무 자동화</a><a href="${home}#audience-small-business">비즈니스</a><a href="${home}#commercial">AI 도구</a><a href="${home}#audience-creator">크리에이터</a><a href="${home}#audience-developer">개발자</a></nav></div></header>`;
}

function siteFooter(config, prefix = './') {
  return `<footer class="site-footer"><div class="footer-inner"><div><strong>${esc(config.site.name)}</strong><p>AI와 자동화를 실제 일과 비즈니스에 적용하는 검증된 실용 가이드.</p></div><nav aria-label="보조 메뉴"><a href="${prefix}feed.xml">RSS</a><a href="${prefix}disclosure.html">Disclosure</a><a href="${prefix}privacy.html">Privacy</a></nav><small>© ${esc(config.site.author)}</small></div></footer>`;
}

function sectionKind(heading = '') {
  const text = String(heading).toLowerCase();
  if (/비교|vs|대안|alternative|가격|비용|선택/.test(text)) return 'comparison';
  if (/단계|방법|설정|구축|시작|step|how/.test(text)) return 'steps';
  if (/주의|위험|한계|보안|실패|리스크/.test(text)) return 'warning';
  if (/추천|결론|판단|적합|선택 가이드/.test(text)) return 'decision';
  return 'standard';
}

function sectionHtml(section, index) {
  const id = `section-${index + 1}-${slugId(section.heading, `section-${index + 1}`)}`;
  const paragraphs = (section.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('');
  const bullets = (section.bullets || []).length
    ? `<ul>${section.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
    : '';
  return `<section id="${esc(id)}" class="content-section type-${sectionKind(section.heading)}"><h2>${esc(section.heading)} <a class="heading-anchor" href="#${esc(id)}" aria-label="${esc(section.heading)} 바로가기">#</a></h2>${paragraphs}${bullets}</section>`;
}

function tocHtml(sections = []) {
  if (sections.length < 3) return '';
  const items = sections.map((section, index) => {
    const id = `section-${index + 1}-${slugId(section.heading, `section-${index + 1}`)}`;
    return `<li><a href="#${esc(id)}"><span>${String(index + 1).padStart(2, '0')}</span>${esc(section.heading)}</a></li>`;
  }).join('');
  return `<nav class="toc" aria-label="목차"><div class="toc-title">이 글에서 다루는 내용</div><ol>${items}</ol></nav>`;
}

function quickSummaryHtml(qa) {
  const takeaways = (qa.revisedSections || []).slice(0, 3).map((section) => {
    const detail = section.bullets?.[0] || section.paragraphs?.[0] || '';
    const clipped = detail.length > 105 ? `${detail.slice(0, 102)}…` : detail;
    return `<li><strong>${esc(section.heading)}</strong>${clipped ? `<span>${esc(clipped)}</span>` : ''}</li>`;
  }).join('');
  return `<aside class="quick-summary"><div class="summary-kicker">핵심 요약</div><p>${esc(qa.revisedDescription)}</p>${takeaways ? `<ul>${takeaways}</ul>` : ''}</aside>`;
}

function readerFitHtml(config, topic) {
  const audience = audienceLabel(config, topic?.audienceSegment);
  const problem = topic?.readerProblem || 'AI와 자동화를 실제 업무에 적용하는 방법이 필요한 사람';
  const outcome = topic?.expectedOutcome || '핵심 선택 기준과 실행 방법을 이해할 수 있습니다.';
  return `<section class="reader-fit" aria-label="이 글이 도움이 되는 사람"><div><span class="panel-label">이 글이 도움이 되는 사람</span><strong>${esc(audience)}</strong><p>${esc(problem)}</p></div><div><span class="panel-label">읽고 나면</span><strong>바로 판단하고 실행할 수 있게</strong><p>${esc(outcome)}</p></div></section>`;
}

function affiliateHtml(article, monetization) {
  const haystack = `${article.title} ${article.description} ${(article.sections || []).flatMap((section) => [section.heading, ...(section.paragraphs || []), ...(section.bullets || [])]).join(' ')}`.toLowerCase();
  const matches = (monetization.affiliateLinks || []).filter((link) =>
    safeUrl(link.url) && (link.match || []).some((term) => haystack.includes(String(term).toLowerCase())));
  if (!matches.length) return '';
  return `<aside class="notice affiliate-box"><div class="panel-label">관련 도구</div><ul>${matches.map((link) =>
    `<li><a href="${esc(safeUrl(link.url))}" rel="sponsored nofollow noopener">${esc(link.label || link.url)}</a></li>`).join('')}</ul><small>${esc(monetization.affiliateDisclosure)}</small></aside>`;
}

function adHtml(monetization, useMidSlot = false, placement = 'article') {
  const client = monetization.adsense?.client || '';
  const slot = useMidSlot ? (monetization.adsense?.midSlot || monetization.adsense?.slot || '') : (monetization.adsense?.slot || '');
  if (!client || !slot) return '';
  return `<div class="ad-slot" data-ad-placement="${esc(placement)}"><div class="ad-label">광고</div><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

function adCount(config, role) {
  const policy = config.monetization?.adsensePolicy || {};
  if (role === 'reach') return policy.reachPlacements ?? 2;
  if (role === 'commercial') return policy.commercialPlacements ?? 1;
  if (role === 'authority') return policy.authorityPlacements ?? 1;
  return 1;
}

function insertAdsenseBlocks({ config, topic, monetization, blocks }) {
  const count = adCount(config, topic?.contentRole);
  const hasAdsense = Boolean(monetization.adsense?.client && monetization.adsense?.slot);
  if (!hasAdsense || count <= 0) return { blocks, topAd: '' };

  const next = [...blocks];
  if (topic?.contentRole === 'reach') {
    const topAd = adHtml(monetization, false, 'after-cover');
    if (count > 1) {
      const index = Math.min(Math.max(3, Math.floor(next.length * 0.55)), next.length);
      next.splice(index, 0, adHtml(monetization, true, 'mid-article'));
    }
    return { blocks: next, topAd };
  }

  const index = topic?.contentRole === 'commercial'
    ? Math.min(2, next.length)
    : Math.min(Math.max(3, Math.floor(next.length * 0.6)), next.length);
  next.splice(index, 0, adHtml(monetization, true, topic?.contentRole === 'commercial' ? 'commercial-mid' : 'authority-mid'));
  return { blocks: next, topAd: '' };
}

function visualFigure(src, alt, caption) {
  if (!src) return '';
  return `<figure class="article-visual"><img src="../${esc(src)}" alt="${esc(alt)}" loading="lazy" width="1200"><figcaption>${esc(caption)}</figcaption></figure>`;
}

function commonsPhotoFigure(photo) {
  if (!photo?.localPath) return '';
  const source = safeUrl(photo.sourcePageUrl);
  const original = safeUrl(photo.originalFileUrl);
  const licenseUrl = safeUrl(photo.licenseUrl);
  const description = photo.description || photo.title || 'Wikimedia Commons 이미지';
  const author = photo.author || '저자 정보는 원본 페이지 참조';
  const license = photo.license || '라이선스는 원본 페이지 참조';
  const licenseHtml = licenseUrl ? `<a href="${esc(licenseUrl)}" rel="license noopener noreferrer">${esc(license)}</a>` : esc(license);
  const sourceHtml = source ? `<a href="${esc(source)}" rel="noopener noreferrer">Wikimedia Commons 원본 페이지</a>` : 'Wikimedia Commons';
  const originalHtml = original ? ` · <a href="${esc(original)}" rel="noopener noreferrer">원본 파일</a>` : '';
  return `<figure class="article-visual licensed-photo"><img src="../${esc(photo.localPath)}" alt="${esc(description)}" loading="lazy"><figcaption><span>${esc(description)}</span><br><span class="photo-credit">사진: ${esc(author)} · ${licenseHtml} · ${sourceHtml}${originalHtml}</span></figcaption></figure>`;
}

function exploreMoreHtml(topic) {
  const segment = topic?.audienceSegment && topic.audienceSegment !== 'general' ? topic.audienceSegment : 'knowledge-worker';
  return `<aside class="explore-more"><div><span class="panel-label">다음으로 읽기</span><h2>한 글에서 끝내지 말고 연결해서 보세요</h2></div><div class="explore-links"><a href="../#audience-${esc(segment)}">${esc(audienceShortLabel(segment))} 가이드 더 보기 <span>→</span></a><a href="../#commercial">AI 도구 비교 보기 <span>→</span></a><a href="../#latest">최신 글 보기 <span>→</span></a></div></aside>`;
}

function cardHtml(config, post, options = {}) {
  const cover = post.visuals?.cover
    ? `<img class="card-cover" src="./${esc(post.visuals.cover)}" alt="" loading="lazy" width="1200" height="630">`
    : `<div class="card-cover card-cover-placeholder" aria-hidden="true"><span>AI</span></div>`;
  const audience = post.audienceSegment ? audienceLabel(config, post.audienceSegment) : 'AI 자동화';
  const role = roleLabel(post.contentRole);
  const tags = (post.tags || []).slice(0, 2).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('');
  return `<article class="card${options.featured ? ' card-featured' : ''}"><a class="card-link" href="./posts/${esc(post.slug)}.html">${cover}<div class="card-body"><div class="card-meta"><span>${esc(audience)}</span><span>${esc(role)}</span></div><h3>${esc(post.title)}</h3><p>${esc(post.description)}</p><div class="card-footer"><div>${tags}</div><span class="read-more">읽기 →</span></div></div></a></article>`;
}

function cardsSection(config, { id, eyebrow, title, description, posts, featured = false, emptyText = '아직 준비 중입니다.' }) {
  const cards = (posts || []).map((post) => cardHtml(config, post, { featured })).join('');
  return `<section id="${esc(id)}" class="home-section"><div class="section-heading"><div><span class="section-eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div></div><div class="${featured ? 'featured-grid' : 'card-grid'}">${cards || `<div class="empty-card"><strong>${esc(title)}</strong><p>${esc(emptyText)}</p></div>`}</div></section>`;
}

function audienceHubHtml(config, posts) {
  const segments = config.research?.audienceSegments || [];
  const nav = segments.map((segment) => {
    const count = posts.filter((post) => post.audienceSegment === segment.id).length;
    return `<a class="audience-card" href="#audience-${esc(segment.id)}"><span class="audience-name">${esc(segment.label)}</span><strong>${esc(audienceShortLabel(segment.id))}</strong><p>${esc(audienceDescription(segment.id))}</p><span class="audience-count">${count ? `${count}개 글` : '가이드 준비 중'} →</span></a>`;
  }).join('');
  return `<section id="audiences" class="home-section audience-hub"><div class="section-heading"><div><span class="section-eyebrow">Choose your path</span><h2>내 상황에 맞는 가이드부터 시작하세요</h2><p>직업이나 기술 수준이 달라도, 목표는 같습니다. 반복업무를 줄이고 더 중요한 일에 시간을 쓰는 것.</p></div></div><div class="audience-grid">${nav}</div></section>`;
}

function audienceSectionsHtml(config, posts) {
  return (config.research?.audienceSegments || []).map((segment) => {
    const segmentPosts = posts.filter((post) => post.audienceSegment === segment.id).slice(0, 4);
    return cardsSection(config, {
      id: `audience-${segment.id}`,
      eyebrow: segment.label,
      title: audienceShortLabel(segment.id),
      description: audienceDescription(segment.id),
      posts: segmentPosts,
      emptyText: `${segment.label}을 위한 첫 번째 가이드를 준비 중입니다.`
    });
  }).join('');
}

export function renderArticle({ config, topic, article, qa, monetization, date, slug, visuals, commonsPhoto }) {
  const base = config.site.baseUrl.replace(/\/$/, '');
  const url = `${base}/posts/${slug}.html`;
  const coverUrl = visuals?.cover ? `${base}/${visuals.cover}` : '';
  const mediaUrl = commonsPhoto?.localPath ? `${base}/${commonsPhoto.localPath}` : '';
  const sources = (qa.verifiedSources || []).map((source) => ({ ...source, url: safeUrl(source.url) })).filter((source) => source.url);
  const targetAudience = audienceLabel(config, topic?.audienceSegment);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: qa.revisedTitle,
    description: qa.revisedDescription,
    datePublished: date,
    dateModified: date,
    author: { '@type': 'Person', name: config.site.author },
    audience: { '@type': 'Audience', audienceType: targetAudience },
    mainEntityOfPage: url,
    ...(coverUrl ? { image: coverUrl } : {})
  };
  if (commonsPhoto && mediaUrl) {
    schema.associatedMedia = {
      '@type': 'ImageObject',
      contentUrl: mediaUrl,
      creditText: commonsPhoto.author,
      ...(safeUrl(commonsPhoto.licenseUrl) ? { license: safeUrl(commonsPhoto.licenseUrl) } : {}),
      ...(safeUrl(commonsPhoto.sourcePageUrl) ? { acquireLicensePage: safeUrl(commonsPhoto.sourcePageUrl) } : {})
    };
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (qa.revisedFaq || []).map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };
  const hasAdsense = Boolean(monetization.adsense?.client && monetization.adsense?.slot);
  const adsenseScript = hasAdsense
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(monetization.adsense.client)}" crossorigin="anonymous"></script>`
    : '';

  const blocks = (qa.revisedSections || []).map(sectionHtml);
  if (commonsPhoto && blocks.length > 1) blocks.splice(1, 0, commonsPhotoFigure(commonsPhoto));
  if (visuals?.summary && blocks.length > 3) {
    blocks.splice(3, 0, visualFigure(visuals.summary, `${qa.revisedTitle} 핵심 요약 인포그래픽`, '본문의 검증된 핵심 내용을 자동으로 시각화한 요약 자료입니다.'));
  }
  const adLayout = insertAdsenseBlocks({ config, topic, monetization, blocks });
  const cover = visualFigure(visuals?.cover, `${qa.revisedTitle} 커버 이미지`, '글의 최종 내용을 바탕으로 자체 생성한 커버입니다.');
  const ogImage = coverUrl ? `<meta property="og:image" content="${esc(coverUrl)}">` : '';
  const trustMeta = `${date} 업데이트 · ${targetAudience} · ${roleLabel(topic?.contentRole)} · 검증 출처 ${sources.length}개`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(qa.revisedTitle)} | ${esc(config.site.name)}</title><meta name="description" content="${esc(qa.revisedDescription)}"><link rel="canonical" href="${esc(url)}"><meta property="og:type" content="article"><meta property="og:title" content="${esc(qa.revisedTitle)}"><meta property="og:description" content="${esc(qa.revisedDescription)}"><meta property="og:url" content="${esc(url)}">${ogImage}<link rel="stylesheet" href="../styles.css">${adsenseScript}<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script><script type="application/ld+json">${JSON.stringify(faqSchema).replace(/</g, '\\u003c')}</script></head><body>${siteHeader(config, '../')}<main id="main-content" class="article-main"><article class="article-shell"><div class="article-kicker">${esc(audienceShortLabel(topic?.audienceSegment))}</div><p class="article-meta">${esc(trustMeta)}</p><h1>${esc(qa.revisedTitle)}</h1><p class="lede article-lede">${esc(qa.revisedDescription)}</p>${readerFitHtml(config, topic)}${cover}${adLayout.topAd}${quickSummaryHtml(qa)}${tocHtml(qa.revisedSections)}<div class="article-content">${adLayout.blocks.join('')}</div>${affiliateHtml({ ...article, title: qa.revisedTitle, description: qa.revisedDescription, sections: qa.revisedSections }, monetization)}<section class="faq-section"><span class="section-eyebrow">FAQ</span><h2>자주 묻는 질문</h2>${(qa.revisedFaq || []).map((item) => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')}</section><section class="sources-section"><span class="section-eyebrow">Sources</span><h2>검증에 사용한 출처</h2><p>중요한 의사결정 전에는 아래 원문도 함께 확인하세요.</p><ol class="sources">${sources.map((source) => `<li><a href="${esc(source.url)}" rel="noopener noreferrer">${esc(source.title)}</a></li>`).join('')}</ol></section>${exploreMoreHtml(topic)}<p class="editorial-note">이 글은 공개 웹 자료를 바탕으로 자동 리서치·작성 후 독립적인 사실검증 단계를 통과했습니다. Wikimedia Commons 사진이 포함된 경우 각 이미지 아래에 저자·라이선스·원본 링크를 표시합니다.</p></article></main>${siteFooter(config, '../')}</body></html>`;
}

export function renderIndex(config, posts) {
  const visible = posts.slice(0, config.content.maxPostsOnIndex);
  const featured = visible.slice(0, 2);
  const commercial = visible.filter((post) => post.contentRole === 'commercial').slice(0, 4);
  const reach = visible.filter((post) => post.contentRole === 'reach').slice(0, 4);
  const latest = visible.slice(0, 8);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(config.site.name)}</title><meta name="description" content="${esc(config.site.description)}"><link rel="canonical" href="${esc(config.site.baseUrl)}"><link rel="alternate" type="application/rss+xml" href="${esc(config.site.baseUrl.replace(/\/$/, ''))}/feed.xml"><link rel="stylesheet" href="./styles.css"></head><body>${siteHeader(config, './')}<main id="main-content" class="home-main"><section class="hero"><div class="hero-copy"><span class="hero-kicker">Practical AI, not hype</span><h1>AI로 반복업무를 줄이고<br>더 중요한 일에 시간을 쓰세요.</h1><p class="lede">${esc(config.site.description)}</p><div class="hero-actions"><a class="button button-primary" href="#audiences">내 상황에 맞는 가이드</a><a class="button button-secondary" href="#commercial">AI 도구 비교 보기</a></div></div><aside class="hero-proof"><span class="panel-label">이 사이트의 기준</span><ul><li><strong>근거 기반</strong><span>공개 출처를 확인하고 검증한 글만 발행</span></li><li><strong>실행 중심</strong><span>도구 소개보다 실제 업무 흐름과 선택 기준에 집중</span></li><li><strong>광고 최소화</strong><span>콘텐츠 역할에 따라 광고 밀도를 다르게 운영</span></li></ul></aside></section>${audienceHubHtml(config, visible)}${cardsSection(config, { id: 'featured', eyebrow: 'Editor’s picks', title: '먼저 읽기 좋은 글', description: '최근 발행된 글 중 바로 적용하기 좋은 가이드입니다.', posts: featured, featured: true, emptyText: '첫 번째 실전 가이드가 발행되면 여기에 표시됩니다.' })}${cardsSection(config, { id: 'commercial', eyebrow: 'Compare & choose', title: 'AI 도구 비교와 선택', description: '가격, 대안, 장단점, 도입 기준처럼 실제 선택에 필요한 내용을 모읍니다.', posts: commercial, emptyText: '비교·가격·대안 콘텐츠가 발행되면 이 섹션에 모입니다.' })}${cardsSection(config, { id: 'how-to', eyebrow: 'How to', title: '실전 자동화 가이드', description: '직접 따라 할 수 있는 단계와 실패하기 쉬운 지점을 중심으로 정리합니다.', posts: reach, emptyText: '실전 How-to 콘텐츠가 발행되면 이 섹션에 모입니다.' })}${audienceSectionsHtml(config, visible)}${cardsSection(config, { id: 'latest', eyebrow: 'Latest', title: '최근 글', description: '가장 최근에 검증·발행한 콘텐츠입니다.', posts: latest, emptyText: '첫 번째 글을 준비 중입니다.' })}</main>${siteFooter(config, './')}</body></html>`;
}

export function renderFeed(config, posts) {
  const xml = esc;
  const base = config.site.baseUrl.replace(/\/$/, '');
  const items = posts.slice(0, 20).map((post) => `<item><title>${xml(post.title)}</title><link>${xml(`${base}/posts/${post.slug}.html`)}</link><guid>${xml(`${base}/posts/${post.slug}.html`)}</guid><pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate><description>${xml(post.description)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(config.site.name)}</title><link>${xml(base)}</link><description>${xml(config.site.description)}</description><language>ko-kr</language>${items}</channel></rss>\n`;
}

export function renderSitemap(config, posts) {
  const xml = esc;
  const base = config.site.baseUrl.replace(/\/$/, '');
  const urls = [base, `${base}/privacy.html`, `${base}/disclosure.html`, ...posts.map((post) => `${base}/posts/${post.slug}.html`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${xml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
}
