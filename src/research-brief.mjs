import { canonicalUrl } from './research.mjs';

const RESEARCH_KEY_FACT_MAX = 12;
const EVIDENCE_EXCERPT_MIN = 80;
const EVIDENCE_EXCERPT_MAX = 440;
const BOILERPLATE_RE = /cookie|privacy policy|terms of service|sign in|log in|subscribe|newsletter|all rights reserved|javascript|skip to content|navigation|accept all|개인정보|쿠키|로그인|회원가입/i;

const keyFactSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claim: { type: 'string' },
    sourceTitle: { type: 'string' },
    sourceUrl: { type: 'string' }
  },
  required: ['claim', 'sourceTitle', 'sourceUrl']
};

export const researchSourceRepairSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keyFacts: { type: 'array', minItems: 4, maxItems: 10, items: keyFactSchema }
  },
  required: ['keyFacts']
};

export function whitelistResearchFacts(items, sourceMap) {
  const facts = [];
  const urls = new Set();
  const seenFacts = new Set();

  for (const item of items || []) {
    const key = canonicalUrl(item?.sourceUrl || '');
    const allowed = sourceMap.get(key);
    const claim = String(item?.claim || '').trim();
    if (!allowed || !claim) continue;
    const factKey = `${key}\n${claim.toLowerCase()}`;
    if (seenFacts.has(factKey)) continue;
    seenFacts.add(factKey);
    urls.add(key);
    facts.push({ claim, sourceTitle: allowed.title, sourceUrl: allowed.url });
  }

  return { facts, urls };
}

function compactResearchFacts(items, sourceMap, maxFacts = RESEARCH_KEY_FACT_MAX) {
  const normalized = whitelistResearchFacts(items, sourceMap);
  if (normalized.facts.length <= maxFacts) return normalized;

  // Preserve source coverage before preserving repeated facts from a dominant source.
  const firstBySource = [];
  const remainder = [];
  const seenSources = new Set();
  for (const fact of normalized.facts) {
    const key = canonicalUrl(fact.sourceUrl);
    if (!seenSources.has(key)) {
      seenSources.add(key);
      firstBySource.push(fact);
    } else {
      remainder.push(fact);
    }
  }
  return whitelistResearchFacts([...firstBySource, ...remainder].slice(0, maxFacts), sourceMap);
}

function normalizedTokens(value) {
  return new Set(String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1));
}

function topicTokens(topic) {
  return normalizedTokens([
    topic?.topic,
    topic?.primaryKeyword,
    topic?.readerProblem,
    topic?.expectedOutcome,
    topic?.searchIntent
  ].filter(Boolean).join(' '));
}

function overlapScore(value, wanted) {
  if (!wanted.size) return 0;
  let score = 0;
  for (const token of normalizedTokens(value)) if (wanted.has(token)) score += 1;
  return score;
}

function parseEvidenceCatalog(evidenceText, sourceMap) {
  const blocks = String(evidenceText || '').split(/\n\n(?=\[S\d+\]\s)/g);
  const out = [];
  for (const block of blocks) {
    const firstLine = block.match(/^\[S\d+\]\s+([^\n]+)/)?.[1]?.trim() || '';
    const sourceUrl = block.match(/^URL:\s*(.+)$/m)?.[1]?.trim() || '';
    const key = canonicalUrl(sourceUrl);
    const allowed = sourceMap.get(key);
    if (!allowed) continue;
    const query = block.match(/^Discovery query:\s*(.+)$/m)?.[1]?.trim() || '';
    const marker = '\nEvidence: ';
    const evidenceStart = block.indexOf(marker);
    const evidence = evidenceStart >= 0 ? block.slice(evidenceStart + marker.length).replace(/\s+/g, ' ').trim() : '';
    if (!evidence) continue;
    out.push({
      key,
      title: allowed.title || firstLine,
      url: allowed.url,
      query,
      evidence
    });
  }
  return out;
}

function trimExcerpt(value, max = EVIDENCE_EXCERPT_MAX) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.65 ? lastSpace : max).trim()}…`;
}

function evidenceExcerpt(entry, wantedTokens) {
  const text = String(entry?.evidence || '').replace(/\s+/g, ' ').trim();
  if (text.length < EVIDENCE_EXCERPT_MIN) return '';

  const sentences = text
    .split(/(?<=[.!?。！？])\s+/u)
    .map((sentence) => trimExcerpt(sentence))
    .filter((sentence) => sentence.length >= EVIDENCE_EXCERPT_MIN && !BOILERPLATE_RE.test(sentence));

  let best = '';
  let bestScore = -1;
  for (const sentence of sentences) {
    const score = overlapScore(sentence, wantedTokens) * 10 +
      (sentence.length >= 120 && sentence.length <= 360 ? 2 : 0);
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }
  if (best) return best;

  // If punctuation is sparse, anchor around a topic token rather than blindly taking
  // navigation text from the beginning of a page.
  const lower = text.toLowerCase();
  for (const token of wantedTokens) {
    const index = lower.indexOf(token.toLowerCase());
    if (index < 0) continue;
    const start = Math.max(0, index - 100);
    const excerpt = trimExcerpt(text.slice(start, start + EVIDENCE_EXCERPT_MAX));
    if (excerpt.length >= EVIDENCE_EXCERPT_MIN && !BOILERPLATE_RE.test(excerpt)) return excerpt;
  }

  const fallback = trimExcerpt(text);
  return fallback.length >= EVIDENCE_EXCERPT_MIN && !BOILERPLATE_RE.test(fallback) ? fallback : '';
}

export function backfillResearchFactsFromEvidence({
  facts,
  topic,
  sourceMap,
  evidenceText,
  minimumSources = 3
}) {
  let normalized = compactResearchFacts(facts, sourceMap);
  if (normalized.urls.size >= minimumSources) return { ...normalized, added: 0 };

  const wanted = topicTokens(topic);
  const catalog = parseEvidenceCatalog(evidenceText, sourceMap)
    .filter((entry) => !normalized.urls.has(entry.key))
    .sort((a, b) => {
      const scoreA = overlapScore(`${a.title} ${a.query} ${a.evidence.slice(0, 1200)}`, wanted);
      const scoreB = overlapScore(`${b.title} ${b.query} ${b.evidence.slice(0, 1200)}`, wanted);
      return scoreB - scoreA || a.key.localeCompare(b.key);
    });

  const combined = [...normalized.facts];
  let added = 0;
  for (const entry of catalog) {
    if (normalized.urls.size >= minimumSources) break;
    const excerpt = evidenceExcerpt(entry, wanted);
    if (!excerpt) continue;
    combined.push({
      claim: `원문 근거: ${excerpt}`,
      sourceTitle: entry.title,
      sourceUrl: entry.url
    });
    normalized = compactResearchFacts(combined, sourceMap);
    added += 1;
  }

  return { ...normalized, added };
}

function diversityError(message) {
  const error = new Error(message);
  error.code = 'RESEARCH_SOURCE_DIVERSITY';
  return error;
}

export async function ensureResearchSourceDiversity({
  ai,
  brief,
  topic,
  sourceMap,
  evidenceText,
  minimumSources = 3,
  repairMaxOutputTokens = 1400
}) {
  let normalized = compactResearchFacts(brief?.keyFacts, sourceMap);
  if (normalized.urls.size >= minimumSources) {
    return {
      brief: { ...brief, keyFacts: normalized.facts },
      repaired: false,
      repairMode: 'none',
      sourceCount: normalized.urls.size
    };
  }

  if (sourceMap.size < minimumSources) {
    throw diversityError(`Research collected only ${sourceMap.size} distinct whitelisted sources; minimum is ${minimumSources}.`);
  }

  console.warn(`[research] brief cited only ${normalized.urls.size} distinct whitelisted sources; applying deterministic evidence backfill before any additional model call.`);
  const local = backfillResearchFactsFromEvidence({
    facts: normalized.facts,
    topic,
    sourceMap,
    evidenceText,
    minimumSources
  });
  normalized = { facts: local.facts, urls: local.urls };
  if (normalized.urls.size >= minimumSources) {
    console.log(`[research] deterministic source backfill added ${local.added} evidence-grounded facts; coverage=${normalized.urls.size} distinct whitelisted sources.`);
    return {
      brief: { ...brief, keyFacts: normalized.facts },
      repaired: true,
      repairMode: 'deterministic-backfill',
      sourceCount: normalized.urls.size
    };
  }

  console.warn(`[research] deterministic backfill reached only ${normalized.urls.size} sources; requesting compact model repair as a fallback.`);
  const allowedCatalog = [...sourceMap.values()].map((source, index) =>
    `[A${index + 1}] ${source.title}\nURL: ${source.url}`).join('\n');
  const repairSeed = { ...brief, keyFacts: normalized.facts };

  const { data } = await ai({
    schema: researchSourceRepairSchema,
    temperature: 0,
    maxOutputTokens: repairMaxOutputTokens,
    instructions: `Repair only the research keyFacts for source diversity. Use only supplied public evidence and only exact URLs from the allowed source catalog. Return 4-10 useful facts and cite at least ${minimumSources} distinct sourceUrl values; prefer 4 distinct sources when evidence supports it. Keep claims conservative and directly supported. Preserve useful facts from the existing brief when they are supported, but do not let one source dominate. Never invent URLs, facts, prices, dates, benchmarks, examples, or personal experience. Return keyFacts only in the requested JSON shape.`,
    input: `Topic: ${JSON.stringify(topic)}\nMinimum distinct whitelisted sources required: ${minimumSources}\n\nEXISTING RESEARCH BRIEF:\n${JSON.stringify(repairSeed)}\n\nALLOWED SOURCE CATALOG (sourceUrl must exactly match one of these):\n${allowedCatalog}\n\nPUBLIC EVIDENCE:\n${evidenceText}`
  });

  normalized = compactResearchFacts([...normalized.facts, ...(data.keyFacts || [])], sourceMap);
  console.log(`[research] model source-diversity fallback produced combined coverage of ${normalized.facts.length} facts across ${normalized.urls.size} distinct whitelisted sources.`);

  if (normalized.urls.size < minimumSources) {
    const finalLocal = backfillResearchFactsFromEvidence({
      facts: normalized.facts,
      topic,
      sourceMap,
      evidenceText,
      minimumSources
    });
    normalized = { facts: finalLocal.facts, urls: finalLocal.urls };
    if (finalLocal.added) {
      console.log(`[research] post-model deterministic backfill added ${finalLocal.added} facts; coverage=${normalized.urls.size}.`);
    }
  }

  if (normalized.urls.size < minimumSources) {
    throw diversityError(`Research source-diversity recovery still cited only ${normalized.urls.size} whitelisted sources; minimum is ${minimumSources}.`);
  }

  return {
    brief: { ...brief, keyFacts: normalized.facts },
    repaired: true,
    repairMode: 'model-fallback',
    sourceCount: normalized.urls.size
  };
}
