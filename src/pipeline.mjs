import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { structuredResponse, ensureModel, removeModel } from './ollama.mjs';
import { collectEvidence, buildDiscoveryQueries, evidenceForPrompt, allowedSourceMap, canonicalUrl } from './research.mjs';
import { ensureResearchSourceDiversity } from './research-brief.mjs';
import { fetchLicensedCommonsPhoto } from './commons.mjs';
import { buildVisualAssets } from './visuals.mjs';
import { renderArticle, renderFeed, renderIndex, renderSitemap } from './render.mjs';

const ROOT = process.cwd();
const readJson = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), 'utf8'));
const config = await readJson('config/blog.config.json');
const posts = await readJson('data/posts.json');
const queue = await readJson('data/topic-queue.json');
const timezone = config.publishing?.timezone || 'Asia/Seoul';
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());
const manualTopic = (process.env.BLOG_TOPIC || '').trim();
const baseUrl = (process.env.OLLAMA_BASE_URL || config.localModel.baseUrl).trim();
const researchOptions = config.research || {};
const audienceSegments = researchOptions.audienceSegments || [];
const audienceIds = audienceSegments.map((segment) => segment.id);
const contentRoles = ['reach', 'commercial', 'authority'];
const monetizationRoutes = ['adsense', 'affiliate', 'digital-product', 'lead', 'mixed', 'none'];

const monetization = {
  adsense: {
    client: (process.env.ADSENSE_CLIENT || '').trim(),
    slot: (process.env.ADSENSE_SLOT || '').trim(),
    midSlot: (process.env.ADSENSE_SLOT_MID || process.env.ADSENSE_SLOT || '').trim()
  },
  affiliateLinks: (() => {
    try { return JSON.parse(process.env.AFFILIATE_LINKS_JSON || '[]'); }
    catch { throw new Error('AFFILIATE_LINKS_JSON must be valid JSON.'); }
  })(),
  affiliateDisclosure: (process.env.AFFILIATE_DISCLOSURE || '').trim() ||
    '이 글에는 제휴 링크가 포함될 수 있으며, 링크를 통한 구매 시 추가 비용 없이 운영자에게 수수료가 지급될 수 있습니다.'
};

const scoreFields = {
  trafficPotential: { type: 'integer', minimum: 0, maximum: 100 },
  audienceBreadth: { type: 'integer', minimum: 0, maximum: 100 },
  intentStrength: { type: 'integer', minimum: 0, maximum: 100 },
  evergreenValue: { type: 'integer', minimum: 0, maximum: 100 },
  freshness: { type: 'integer', minimum: 0, maximum: 100 },
  evidenceCoverage: { type: 'integer', minimum: 0, maximum: 100 },
  monetizationFit: { type: 'integer', minimum: 0, maximum: 100 },
  competitionOpportunity: { type: 'integer', minimum: 0, maximum: 100 }
};

const topicCandidateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string' },
    primaryKeyword: { type: 'string' },
    audienceSegment: { type: 'string' },
    contentRole: { type: 'string' },
    monetizationRoute: { type: 'string' },
    readerProblem: { type: 'string' },
    expectedOutcome: { type: 'string' },
    searchIntent: { type: 'string' },
    monetizationAngle: { type: 'string' },
    whyNow: { type: 'string' },
    ...scoreFields
  },
  required: [
    'topic', 'primaryKeyword', 'audienceSegment', 'contentRole', 'monetizationRoute',
    'readerProblem', 'expectedOutcome', 'searchIntent', 'monetizationAngle', 'whyNow',
    ...Object.keys(scoreFields)
  ]
};

const topicSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { candidates: { type: 'array', minItems: 5, maxItems: 10, items: topicCandidateSchema } },
  required: ['candidates']
};

const researchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    thesis: { type: 'string' },
    keyFacts: {
      type: 'array', minItems: 4, maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        properties: { claim: { type: 'string' }, sourceTitle: { type: 'string' }, sourceUrl: { type: 'string' } },
        required: ['claim', 'sourceTitle', 'sourceUrl']
      }
    },
    readerQuestions: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string' } },
    contentGap: { type: 'string' },
    monetizationFit: { type: 'string' },
    caveats: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' } }
  },
  required: ['thesis', 'keyFacts', 'readerQuestions', 'contentGap', 'monetizationFit', 'caveats']
};

const sectionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    heading: { type: 'string' },
    paragraphs: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
    bullets: { type: 'array', maxItems: 8, items: { type: 'string' } }
  },
  required: ['heading', 'paragraphs', 'bullets']
};

const faqItemSchema = {
  type: 'object', additionalProperties: false,
  properties: { question: { type: 'string' }, answer: { type: 'string' } },
  required: ['question', 'answer']
};

const sourceSchema = {
  type: 'object', additionalProperties: false,
  properties: { title: { type: 'string' }, url: { type: 'string' } },
  required: ['title', 'url']
};

const articleSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string' },
    tags: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'string' } },
    sections: { type: 'array', minItems: 5, maxItems: 9, items: sectionSchema },
    faq: { type: 'array', minItems: 2, maxItems: 5, items: faqItemSchema },
    sources: { type: 'array', minItems: 3, maxItems: 10, items: sourceSchema },
    affiliateOpportunities: { type: 'array', maxItems: 5, items: { type: 'string' } }
  },
  required: ['title', 'slug', 'description', 'category', 'tags', 'sections', 'faq', 'sources', 'affiliateOpportunities']
};

const photoPlanSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    photoNeeded: { type: 'boolean' },
    photoSearchQuery: { type: 'string' },
    photoReason: { type: 'string' }
  },
  required: ['photoNeeded', 'photoSearchQuery', 'photoReason']
};

const qaSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    approved: { type: 'boolean' },
    revisedTitle: { type: 'string' },
    revisedDescription: { type: 'string' },
    revisedSections: { type: 'array', minItems: 5, maxItems: 9, items: sectionSchema },
    revisedFaq: { type: 'array', minItems: 2, maxItems: 5, items: faqItemSchema },
    verifiedSources: { type: 'array', minItems: 3, maxItems: 10, items: sourceSchema },
    warnings: { type: 'array', maxItems: 10, items: { type: 'string' } },
    verificationSummary: { type: 'string' },
    visualPlan: photoPlanSchema
  },
  required: ['score', 'approved', 'revisedTitle', 'revisedDescription', 'revisedSections', 'revisedFaq', 'verifiedSources', 'warnings', 'verificationSummary', 'visualPlan']
};

async function runStage(stageName, task) {
  const stage = config.localModel.stages[stageName];
  if (!stage) throw new Error(`Missing model stage config: ${stageName}`);
  console.log(`\n[stage] ${stageName} -> ${stage.model}`);
  await ensureModel({ baseUrl, model: stage.model });
  const ai = (args) => structuredResponse({ baseUrl, ...stage, ...args });
  try {
    return await task(ai, stage);
  } finally {
    if (config.localModel.cleanupAfterStage) await removeModel({ baseUrl, model: stage.model });
  }
}

function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
}
function tokens(value) {
  return new Set(norm(value).split(/\s+/).filter((x) => x.length > 1));
}
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let same = 0;
  for (const x of A) if (B.has(x)) same += 1;
  return same / (A.size + B.size - same);
}
function tooSimilar(candidate) {
  return posts.slice(0, config.content.recentTitleWindow).some((p) =>
    similarity(candidate.primaryKeyword, p.primaryKeyword) > 0.62 || similarity(candidate.topic, p.title) > 0.68);
}
function duplicateKeyword(keyword) {
  const n = norm(keyword);
  return posts.some((p) => norm(p.primaryKeyword) === n);
}
function duplicateTitle(title) {
  const n = norm(title);
  return posts.some((p) => norm(p.title) === n);
}

function audienceLabel(id) {
  return audienceSegments.find((segment) => segment.id === id)?.label || id || '일반 독자';
}

function audiencePrompt(id) {
  const segment = audienceSegments.find((item) => item.id === id);
  if (!segment) return '일반 독자가 이해할 수 있는 평이한 한국어를 사용하고 전문용어는 필요한 경우 설명한다.';
  if (id === 'developer') {
    return '개발자·AI 실무자를 대상으로 한다. 구현 세부사항, 제약조건, 보안·운영 trade-off를 충분히 다루되 불필요한 전문용어 과시는 피한다.';
  }
  return `${segment.label}가 대상이다. 코딩 지식을 전제로 하지 말고, 전문용어를 쉽게 풀어 설명하며 실제 업무에서 바로 따라 할 수 있는 단계와 시간·비용 절감 관점을 우선한다.`;
}

function weightedTopicScore(candidate) {
  return Math.round(
    candidate.trafficPotential * 0.22 +
    candidate.audienceBreadth * 0.13 +
    candidate.intentStrength * 0.16 +
    candidate.evergreenValue * 0.12 +
    candidate.freshness * 0.08 +
    candidate.evidenceCoverage * 0.12 +
    candidate.monetizationFit * 0.10 +
    candidate.competitionOpportunity * 0.07
  );
}

function observedShare(field, value, windowSize) {
  const recent = posts.slice(0, windowSize).filter((post) => post[field]);
  if (!recent.length) return 0;
  return recent.filter((post) => post[field] === value).length / recent.length;
}

function targetBalanceBonus(field, value, targets, windowSize, maxBonus) {
  if (!targets || typeof targets[value] !== 'number') return 0;
  const recentWithField = posts.slice(0, windowSize).filter((post) => post[field]);
  if (!recentWithField.length) return 0;
  const gap = targets[value] - observedShare(field, value, windowSize);
  return Math.round(Math.max(-maxBonus, Math.min(maxBonus, gap * 40)));
}

function portfolioAdjustedScore(candidate) {
  const portfolio = config.content.portfolio || {};
  const windowSize = portfolio.balanceWindow || 30;
  const segmentBonus = targetBalanceBonus('audienceSegment', candidate.audienceSegment, portfolio.audienceTargets, windowSize, 8);
  const roleBonus = targetBalanceBonus('contentRole', candidate.contentRole, portfolio.contentRoleTargets, windowSize, 6);
  return Math.max(0, Math.min(100, weightedTopicScore(candidate) + segmentBonus + roleBonus));
}

function validCandidate(candidate) {
  return audienceIds.includes(candidate.audienceSegment) &&
    contentRoles.includes(candidate.contentRole) &&
    monetizationRoutes.includes(candidate.monetizationRoute);
}

function whitelistSources(items, sourceMap) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = canonicalUrl(item.url || item.sourceUrl || '');
    const allowed = sourceMap.get(key);
    if (!allowed || seen.has(key)) continue;
    seen.add(key);
    out.push({ title: allowed.title || item.title || item.sourceTitle, url: allowed.url });
  }
  return out;
}

function manualTopicRecord(value, reason) {
  return {
    topic: value,
    primaryKeyword: value,
    audienceSegment: 'general',
    contentRole: 'authority',
    monetizationRoute: 'none',
    readerProblem: value,
    expectedOutcome: '수동으로 지정한 주제에 대한 실용적인 답을 제공한다.',
    searchIntent: reason,
    monetizationAngle: 'manual',
    whyNow: reason,
    opportunityScore: 100
  };
}

async function chooseTopic() {
  if (manualTopic) return manualTopicRecord(manualTopic, 'manual workflow dispatch');
  if (queue.length) {
    const queued = queue.shift();
    if (typeof queued === 'string') return manualTopicRecord(queued, 'topic queue');
    return {
      audienceSegment: 'general',
      contentRole: 'authority',
      monetizationRoute: 'none',
      readerProblem: queued.topic || queued.primaryKeyword || 'queued topic',
      expectedOutcome: '큐에 지정된 주제를 실용적으로 설명한다.',
      opportunityScore: 100,
      ...queued
    };
  }

  const queries = buildDiscoveryQueries(researchOptions, today);
  console.log(`[topic] discovery queries: ${queries.join(' | ')}`);
  const docs = await collectEvidence(queries, { ...researchOptions, maxDocuments: Math.max(10, researchOptions.maxDocuments || 10) });
  if (docs.length < 4) throw new Error(`Topic discovery found only ${docs.length} usable public sources.`);

  const recent = posts.slice(0, config.content.recentTitleWindow).map((post) => ({
    title: post.title,
    keyword: post.primaryKeyword,
    audienceSegment: post.audienceSegment || 'legacy',
    contentRole: post.contentRole || 'legacy'
  }));
  const segmentCatalog = audienceSegments.map(({ id, label, searchPhrase }) => ({ id, label, searchPhrase }));
  const { data } = await runStage('topic', (ai) => ai({
    schema: topicSchema,
    instructions: `You are a search-demand opportunity analyst for a broad Korean AI로 일하는 법 publication. Generate diverse candidates only from supplied public evidence. The publication serves office/knowledge workers, small business owners, freelancers/solo operators, content creators, and developers/AI practitioners. Do not collapse everything into developer tooling. Favor real problems where AI or automation can save time, reduce repetitive work, lower costs, improve customer workflows, or support a concrete software decision. Include a healthy mix of reach topics (broad informational demand), commercial topics (comparison/alternatives/pricing/tool selection), and authority topics (deeper implementation/security/architecture). Never fabricate search volume. Scores are qualitative estimates from evidence. Avoid generic news summaries, hype, thin listicles, YMYL, and topics unrelated to practical AI/automation.`,
    input: `Date: ${today}\nNiche: ${config.content.niche}\nAudience segments: ${JSON.stringify(segmentCatalog)}\nPortfolio targets: ${JSON.stringify(config.content.portfolio)}\nRecent posts to avoid/rebalance: ${JSON.stringify(recent)}\nAllowed audienceSegment IDs: ${audienceIds.join(', ')}\nAllowed contentRole values: ${contentRoles.join(', ')}\nAllowed monetizationRoute values: ${monetizationRoutes.join(', ')}\nReturn ${config.research.candidateCount || 8} genuinely distinct candidates across multiple audience segments.\n\nPUBLIC EVIDENCE:\n${evidenceForPrompt(docs)}`
  }));

  const ranked = (data.candidates || [])
    .filter((candidate) => validCandidate(candidate) && !tooSimilar(candidate) && !duplicateKeyword(candidate.primaryKeyword))
    .map((candidate) => ({ ...candidate, opportunityScore: portfolioAdjustedScore(candidate) }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
  if (!ranked.length) throw new Error('All discovered topic candidates were invalid or too similar to recent content.');
  console.log('[topic] ranked candidates:');
  ranked.forEach((candidate, index) => console.log(
    `  ${index + 1}. ${candidate.primaryKeyword} = ${candidate.opportunityScore}/100 · ${candidate.audienceSegment} · ${candidate.contentRole}`));
  return ranked[0];
}

async function researchTopic(topic) {
  const segment = audienceSegments.find((item) => item.id === topic.audienceSegment);
  const segmentPhrase = segment?.searchPhrase || topic.audienceSegment || 'practical users';
  const queries = [
    topic.primaryKeyword,
    `${topic.primaryKeyword} ${segmentPhrase}`,
    `${topic.primaryKeyword} official documentation`,
    `${topic.topic} comparison pricing`,
    `${topic.primaryKeyword} limitations privacy security`
  ];
  const documents = await collectEvidence(queries, researchOptions);
  if (documents.length < 3) throw new Error(`Research found only ${documents.length} usable public sources; refusing to publish.`);
  const sourceMap = allowedSourceMap(documents);
  const evidenceText = evidenceForPrompt(documents);
  const brief = await runStage('research', async (ai, stage) => {
    const { data } = await ai({
      schema: researchSchema,
      instructions: 'Create a rigorous research brief using only supplied evidence. Never invent URLs, claims, prices, dates, benchmarks, or personal experience. Every keyFact.sourceUrl must exactly match a supplied URL. Across keyFacts, cite at least 3 distinct supplied sourceUrl values and aim for 4 when evidence supports it; do not let one source dominate before at least 3 sources are represented. Prefer first-party/project documentation for facts. Use community sources mainly for context and caveats. Explicitly identify uncertainty and focus on the target reader problem rather than generic product descriptions.',
      input: `Date: ${today}\nTopic: ${JSON.stringify(topic)}\nTarget audience: ${audienceLabel(topic.audienceSegment)}\nReader guidance: ${audiencePrompt(topic.audienceSegment)}\n\nPUBLIC EVIDENCE:\n${evidenceText}`
    });

    const diversified = await ensureResearchSourceDiversity({
      ai,
      brief: data,
      topic,
      sourceMap,
      evidenceText,
      minimumSources: 3,
      repairMaxOutputTokens: Math.min(1400, stage.maxOutputTokens || 1400)
    });
    console.log(`[research] brief source coverage: ${diversified.sourceCount} distinct whitelisted sources${diversified.repaired ? ' after focused repair' : ''}.`);
    return diversified.brief;
  });

  return { brief, documents, sourceMap };
}

async function writeArticle(topic, research) {
  const { data } = await runStage('draft', (ai) => ai({
    schema: articleSchema,
    instructions: `Write a high-quality Korean practical article grounded only in the supplied research brief. ${audiencePrompt(topic.audienceSegment)} Start from the reader's concrete problem and desired outcome, not from product marketing. Add actionable steps, decision criteria, tradeoffs, limitations, cost/time considerations where supported, and failure modes. For non-developer audiences, avoid unnecessary code and explain setup in plain language. For developer audiences, preserve technical depth. Never claim personal experience or invent facts. Avoid SEO filler, repetitive prose, and fake precision. The slug must be lowercase ASCII with hyphens. Aim for roughly 1400-2100 Korean words only when evidence supports that depth.`,
    input: `Topic and content strategy: ${JSON.stringify(topic)}\nResearch brief: ${JSON.stringify(research)}\nSources in the article must use URLs from the research brief only.`
  }));
  return data;
}

async function qualityCheck(topic, bundle, article) {
  const { brief, documents, sourceMap } = bundle;
  const { data } = await runStage('qa', (ai) => ai({
    schema: qaSchema,
    instructions: `Act as an independent senior editor and fact checker. Verify every consequential claim against supplied evidence. Remove unsupported claims, fake precision, stale product details, SEO padding, weak explanations, misleading monetization, and jargon inappropriate for the target audience. Check that the article actually solves the stated readerProblem and is understandable for ${audienceLabel(topic.audienceSegment)}. Preserve useful depth. Do not introduce new facts or URLs. approved may be true only when the revised article is factually defensible, useful, and appropriately written for its audience. For visualPlan, request a real photograph only when a photograph materially improves understanding of a real-world person, place, physical device, facility, event, or object. Do not request a photo for abstract software concepts, logos, UI screenshots, decorative stock imagery, charts, or concepts better explained by the generated infographic. When photoNeeded is true, photoSearchQuery must be a short English noun phrase suitable for Wikimedia Commons and describe the real-world subject rather than a brand logo.`,
    input: `Date: ${today}\nMinimum passing score: ${config.content.minimumQualityScore}\nTopic: ${JSON.stringify(topic)}\nResearch: ${JSON.stringify(brief)}\nDraft: ${JSON.stringify(article)}\n\nPUBLIC EVIDENCE:\n${evidenceForPrompt(documents)}`
  }));
  return { ...data, verifiedSources: whitelistSources(data.verifiedSources, sourceMap) };
}

await mkdir(path.join(ROOT, 'public', 'posts'), { recursive: true });
await mkdir(path.join(ROOT, 'public', 'assets', 'posts'), { recursive: true });
await mkdir(path.join(ROOT, 'data', 'articles'), { recursive: true });
await mkdir(path.join(ROOT, 'data', 'media'), { recursive: true });

const topic = await chooseTopic();
if (duplicateKeyword(topic.primaryKeyword)) throw new Error(`Duplicate primary keyword: ${topic.primaryKeyword}`);
console.log(`Selected: ${topic.topic} (${topic.opportunityScore}/100) · audience=${topic.audienceSegment} · role=${topic.contentRole}`);

const researchBundle = await researchTopic(topic);
console.log(`[research] final evidence documents: ${researchBundle.documents.length}`);
const article = await writeArticle(topic, researchBundle.brief);
const qa = await qualityCheck(topic, researchBundle, article);
console.log(`[qa] score=${qa.score}/100 approved=${qa.approved} verifiedSources=${qa.verifiedSources.length}`);

if (!qa.approved || qa.score < config.content.minimumQualityScore) {
  throw new Error(`Quality gate failed: ${qa.score}/100. ${(qa.warnings || []).join(' | ')}`);
}
if (qa.verifiedSources.length < 3) throw new Error('Quality review returned fewer than 3 whitelisted public sources.');
if (duplicateTitle(qa.revisedTitle)) throw new Error(`Duplicate article title: ${qa.revisedTitle}`);
const articleChars = qa.revisedSections.flatMap((section) => section.paragraphs || []).join('').length;
if (articleChars < 3500) throw new Error(`Quality guard: final article is too thin (${articleChars} chars).`);

let slug = slugify(article.slug || qa.revisedTitle);
if (!slug) slug = `article-${today}`;
if (posts.some((post) => post.slug === slug)) throw new Error(`Duplicate slug: ${slug}`);

const visualFiles = {
  cover: config.visuals?.generateCover ? `assets/posts/${slug}-cover.svg` : null,
  summary: config.visuals?.generateSummary ? `assets/posts/${slug}-summary.svg` : null
};
if (config.visuals?.enabled && (visualFiles.cover || visualFiles.summary)) {
  const visuals = buildVisualAssets({
    title: qa.revisedTitle,
    description: qa.revisedDescription,
    category: article.category,
    tags: article.tags,
    sections: qa.revisedSections
  });
  if (visualFiles.cover) await writeFile(path.join(ROOT, 'public', visualFiles.cover), visuals.cover);
  if (visualFiles.summary) await writeFile(path.join(ROOT, 'public', visualFiles.summary), visuals.summary);
  console.log(`[visuals] generated ${[visualFiles.cover, visualFiles.summary].filter(Boolean).join(' and ')}`);
}

let commonsPhoto = null;
const commonsOptions = config.visuals?.commonsPhotos || {};
if (config.visuals?.enabled && commonsOptions.enabled && qa.visualPlan?.photoNeeded) {
  const photoQuery = String(qa.visualPlan.photoSearchQuery || '').trim();
  console.log(`[commons] photo requested: ${photoQuery || '(empty query)'} · ${qa.visualPlan.photoReason}`);
  if (photoQuery) commonsPhoto = await fetchLicensedCommonsPhoto({ query: photoQuery, slug, root: ROOT, options: commonsOptions });
}
if (commonsPhoto) {
  await writeFile(path.join(ROOT, 'data', 'media', `${slug}.json`), `${JSON.stringify(commonsPhoto, null, 2)}\n`);
}

const models = Object.fromEntries(Object.entries(config.localModel.stages).map(([key, value]) => [key, value.model]));
const record = {
  title: qa.revisedTitle,
  slug,
  description: qa.revisedDescription,
  category: article.category,
  tags: article.tags,
  date: today,
  primaryKeyword: topic.primaryKeyword,
  audienceSegment: topic.audienceSegment,
  contentRole: topic.contentRole,
  monetizationRoute: topic.monetizationRoute,
  readerProblem: topic.readerProblem,
  expectedOutcome: topic.expectedOutcome,
  opportunityScore: topic.opportunityScore,
  qualityScore: qa.score,
  verificationSummary: qa.verificationSummary,
  sources: qa.verifiedSources,
  models,
  researchMode: 'free-public-web',
  visuals: config.visuals?.enabled ? visualFiles : null,
  media: commonsPhoto ? {
    provider: commonsPhoto.provider,
    localPath: commonsPhoto.localPath,
    sourcePageUrl: commonsPhoto.sourcePageUrl,
    license: commonsPhoto.license,
    author: commonsPhoto.author
  } : null
};
const nextPosts = [record, ...posts];

await writeFile(path.join(ROOT, 'public', 'posts', `${slug}.html`), renderArticle({
  config,
  topic,
  article,
  qa,
  monetization,
  date: today,
  slug,
  visuals: record.visuals,
  commonsPhoto
}));
await writeFile(path.join(ROOT, 'data', 'articles', `${slug}.json`), `${JSON.stringify({
  topic,
  evidence: researchBundle.documents,
  research: researchBundle.brief,
  article,
  qa,
  models,
  visuals: record.visuals,
  media: commonsPhoto
}, null, 2)}\n`);
await writeFile(path.join(ROOT, 'data', 'posts.json'), `${JSON.stringify(nextPosts, null, 2)}\n`);
await writeFile(path.join(ROOT, 'data', 'topic-queue.json'), `${JSON.stringify(queue, null, 2)}\n`);
await writeFile(path.join(ROOT, 'public', 'index.html'), renderIndex(config, nextPosts));
await writeFile(path.join(ROOT, 'public', 'feed.xml'), renderFeed(config, nextPosts));
await writeFile(path.join(ROOT, 'public', 'sitemap.xml'), renderSitemap(config, nextPosts));
await writeFile(path.join(ROOT, 'public', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.site.baseUrl.replace(/\/$/, '')}/sitemap.xml\n`);
console.log(`Published ${qa.revisedTitle} -> public/posts/${slug}.html`);