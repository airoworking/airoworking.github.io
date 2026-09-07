import { ensureResearchSourceDiversity } from '../src/research-brief.mjs';

const sources = [
  ['https://example.com/a', 'Source A'],
  ['https://example.com/b', 'Source B'],
  ['https://example.com/c', 'Source C'],
  ['https://example.com/d', 'Source D']
];
const sourceMap = new Map(sources.map(([url, title]) => [url, { url, title }]));

function evidenceBlock(index, url, title, query, evidence) {
  return `[S${index}] ${title}\nURL: ${url}\nProvider: duckduckgo\nDiscovery query: ${query}\nPopularity signal: 0\nUpdated: unknown\nEvidence: ${evidence}`;
}

const evidenceText = [
  evidenceBlock(1, 'https://example.com/a', 'Source A', 'content automation tools',
    'Source A explains a content automation workflow and describes how teams can connect planning, drafting, review, and publishing while keeping human review checkpoints before release.'),
  evidenceBlock(2, 'https://example.com/b', 'Source B', 'content automation comparison',
    'Source B documents comparison criteria for automation products, including integration coverage, workflow control, permissions, operational limits, and the need to verify generated content before publication.'),
  evidenceBlock(3, 'https://example.com/c', 'Source C', 'small business content automation',
    'Source C describes small-business automation considerations such as setup effort, recurring maintenance, approval responsibilities, and choosing a narrow repeatable workflow before expanding automation.'),
  evidenceBlock(4, 'https://example.com/d', 'Source D', 'content automation privacy security',
    'Source D discusses privacy and security controls for automated content workflows, including access boundaries, data handling expectations, review procedures, and operational safeguards for external services.')
].join('\n\n');

const run18OneSourceBrief = {
  thesis: '테스트 논지',
  keyFacts: [
    { claim: '첫 번째 사실', sourceTitle: 'wrong title', sourceUrl: 'https://example.com/a' },
    { claim: '두 번째 사실', sourceTitle: 'wrong title', sourceUrl: 'https://example.com/a' },
    { claim: '세 번째 사실', sourceTitle: 'wrong title', sourceUrl: 'https://example.com/a' },
    { claim: '네 번째 사실', sourceTitle: 'wrong title', sourceUrl: 'https://example.com/a' }
  ],
  readerQuestions: ['질문 1', '질문 2', '질문 3'],
  contentGap: '차이',
  monetizationFit: '적합',
  caveats: ['주의']
};

// Automated Blog Publisher #18 regression: the model and its repair both favored one
// URL even though ten usable documents existed. The pipeline must now recover directly
// from the already-collected evidence instead of spending another slow model call.
let repairCalls = 0;
const deterministic = await ensureResearchSourceDiversity({
  ai: async () => {
    repairCalls += 1;
    throw new Error('Run #18 regression should be solved without another model call.');
  },
  brief: run18OneSourceBrief,
  topic: {
    topic: '콘텐츠 자동화 도구 비교',
    primaryKeyword: 'content automation tools',
    readerProblem: '소규모 사업자가 콘텐츠 자동화 도구를 비교해야 한다'
  },
  sourceMap,
  evidenceText
});

if (repairCalls !== 0) throw new Error(`Deterministic backfill unexpectedly called the model ${repairCalls} time(s).`);
if (!deterministic.repaired || deterministic.repairMode !== 'deterministic-backfill') {
  throw new Error(`Expected deterministic-backfill repair mode, got ${deterministic.repairMode}.`);
}
if (deterministic.sourceCount < 3) throw new Error(`Run #18 regression still has only ${deterministic.sourceCount} sources.`);
if (deterministic.brief.keyFacts.length > 12) throw new Error('Backfill exceeded the research schema keyFact maximum.');
const deterministicUrls = new Set(deterministic.brief.keyFacts.map((fact) => fact.sourceUrl));
if (!deterministicUrls.has('https://example.com/a') || deterministicUrls.size < 3) {
  throw new Error('Deterministic recovery did not preserve the original source while adding independent sources.');
}
if (!deterministic.brief.keyFacts.some((fact) => fact.claim.startsWith('원문 근거: '))) {
  throw new Error('Deterministic recovery must add evidence-grounded source excerpts, not invented summaries.');
}
if (deterministic.brief.keyFacts.some((fact) => fact.sourceTitle === 'wrong title')) {
  throw new Error('Whitelisted canonical source titles must replace model-provided titles.');
}

repairCalls = 0;
const alreadyDiverse = await ensureResearchSourceDiversity({
  ai: async () => { repairCalls += 1; throw new Error('Repair should not run for an already diverse brief.'); },
  brief: {
    ...run18OneSourceBrief,
    keyFacts: [
      { claim: 'A', sourceTitle: 'x', sourceUrl: 'https://example.com/a' },
      { claim: 'B', sourceTitle: 'x', sourceUrl: 'https://example.com/b' },
      { claim: 'C', sourceTitle: 'x', sourceUrl: 'https://example.com/c' },
      { claim: 'D', sourceTitle: 'x', sourceUrl: 'https://example.com/c' }
    ]
  },
  topic: { topic: '테스트 주제' },
  sourceMap,
  evidenceText
});

if (repairCalls !== 0) throw new Error('Repair ran unnecessarily.');
if (alreadyDiverse.sourceCount !== 3 || alreadyDiverse.repairMode !== 'none') {
  throw new Error('Expected three distinct whitelisted sources without repair.');
}

// If deterministic evidence parsing is unavailable for some reason, keep the compact
// model repair as a fallback and merge it with useful existing facts instead of replacing them.
repairCalls = 0;
const modelFallback = await ensureResearchSourceDiversity({
  ai: async (request) => {
    repairCalls += 1;
    if (!request.instructions.includes('at least 3 distinct sourceUrl')) {
      throw new Error('Model fallback prompt must require at least three distinct source URLs.');
    }
    if (request.maxOutputTokens > 1600) throw new Error('Source repair should stay compact.');
    return {
      data: {
        keyFacts: [
          { claim: '첫 번째 사실', sourceTitle: 'ignored', sourceUrl: 'https://example.com/a' },
          { claim: '세 번째 사실', sourceTitle: 'ignored', sourceUrl: 'https://example.com/b' },
          { claim: '새로운 검증 사실', sourceTitle: 'ignored', sourceUrl: 'https://example.com/c' },
          { claim: '추가 검증 사실', sourceTitle: 'ignored', sourceUrl: 'https://example.com/d' }
        ]
      }
    };
  },
  brief: {
    ...run18OneSourceBrief,
    keyFacts: [
      { claim: '기존 A 사실', sourceTitle: 'x', sourceUrl: 'https://example.com/a' },
      { claim: '기존 B 사실', sourceTitle: 'x', sourceUrl: 'https://example.com/b' }
    ]
  },
  topic: { topic: '테스트 주제', primaryKeyword: 'test topic' },
  sourceMap,
  evidenceText: 'mock evidence without structured source blocks'
});

if (repairCalls !== 1) throw new Error(`Expected one compact model fallback, got ${repairCalls}.`);
if (modelFallback.repairMode !== 'model-fallback' || modelFallback.sourceCount !== 4) {
  throw new Error('Compact model fallback did not recover four-source coverage.');
}
if (!modelFallback.brief.keyFacts.some((fact) => fact.claim === '기존 A 사실')) {
  throw new Error('Model fallback must preserve useful existing research facts.');
}
if (modelFallback.brief.keyFacts.some((fact) => fact.sourceTitle === 'ignored')) {
  throw new Error('Model fallback source titles must be canonicalized through the whitelist.');
}

let failedClosed = false;
try {
  await ensureResearchSourceDiversity({
    ai: async () => ({
      data: {
        keyFacts: [
          { claim: 'A', sourceTitle: 'x', sourceUrl: 'https://example.com/a' },
          { claim: 'B', sourceTitle: 'x', sourceUrl: 'https://example.com/a' },
          { claim: 'C', sourceTitle: 'x', sourceUrl: 'https://example.com/b' },
          { claim: 'D', sourceTitle: 'x', sourceUrl: 'https://example.com/b' }
        ]
      }
    }),
    brief: run18OneSourceBrief,
    topic: { topic: '테스트 주제' },
    sourceMap,
    evidenceText: 'mock evidence without structured source blocks'
  });
} catch (error) {
  failedClosed = error.code === 'RESEARCH_SOURCE_DIVERSITY';
}
if (!failedClosed) throw new Error('Source diversity must still fail closed when neither collected evidence nor fallback can establish three sources.');

let impossibleCalls = 0;
let impossibleFailedClosed = false;
try {
  await ensureResearchSourceDiversity({
    ai: async () => { impossibleCalls += 1; throw new Error('Impossible coverage must fail before a model call.'); },
    brief: run18OneSourceBrief,
    topic: { topic: '테스트 주제' },
    sourceMap: new Map(sources.slice(0, 2).map(([url, title]) => [url, { url, title }])),
    evidenceText
  });
} catch (error) {
  impossibleFailedClosed = error.code === 'RESEARCH_SOURCE_DIVERSITY';
}
if (!impossibleFailedClosed || impossibleCalls !== 0) {
  throw new Error('Impossible source coverage should fail closed immediately without wasting model time.');
}

console.log('Research source diversity policy OK: run #18 one-source output recovers deterministically from collected evidence, model fallback remains compact, and genuine evidence shortages still fail closed.');
