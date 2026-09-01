import { canonicalUrl } from './research.mjs';

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

export async function ensureResearchSourceDiversity({
  ai,
  brief,
  topic,
  sourceMap,
  evidenceText,
  minimumSources = 3,
  repairMaxOutputTokens = 1400
}) {
  let normalized = whitelistResearchFacts(brief?.keyFacts, sourceMap);
  if (normalized.urls.size >= minimumSources) {
    return { brief: { ...brief, keyFacts: normalized.facts }, repaired: false, sourceCount: normalized.urls.size };
  }

  console.warn(`[research] brief cited only ${normalized.urls.size} distinct whitelisted sources; requesting focused source-diversity repair before releasing the research model.`);
  const allowedCatalog = [...sourceMap.values()].map((source, index) =>
    `[A${index + 1}] ${source.title}\nURL: ${source.url}`).join('\n');

  const { data } = await ai({
    schema: researchSourceRepairSchema,
    temperature: 0,
    maxOutputTokens: repairMaxOutputTokens,
    instructions: `Repair only the research keyFacts for source diversity. Use only supplied public evidence and only exact URLs from the allowed source catalog. Return 4-10 useful facts and cite at least ${minimumSources} distinct sourceUrl values; prefer 4 distinct sources when evidence supports it. Keep claims conservative and directly supported. Preserve useful facts from the existing brief when they are supported, but do not let one source dominate. Never invent URLs, facts, prices, dates, benchmarks, examples, or personal experience. Return keyFacts only in the requested JSON shape.`,
    input: `Topic: ${JSON.stringify(topic)}\nMinimum distinct whitelisted sources required: ${minimumSources}\n\nEXISTING RESEARCH BRIEF:\n${JSON.stringify(brief)}\n\nALLOWED SOURCE CATALOG (sourceUrl must exactly match one of these):\n${allowedCatalog}\n\nPUBLIC EVIDENCE:\n${evidenceText}`
  });

  normalized = whitelistResearchFacts(data.keyFacts, sourceMap);
  console.log(`[research] source-diversity repair produced ${normalized.facts.length} facts across ${normalized.urls.size} distinct whitelisted sources.`);
  if (normalized.urls.size < minimumSources) {
    const error = new Error(`Research source-diversity repair still cited only ${normalized.urls.size} whitelisted sources; minimum is ${minimumSources}.`);
    error.code = 'RESEARCH_SOURCE_DIVERSITY';
    throw error;
  }

  return {
    brief: { ...brief, keyFacts: normalized.facts },
    repaired: true,
    sourceCount: normalized.urls.size
  };
}
