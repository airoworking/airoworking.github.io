import { ensureResearchSourceDiversity } from '../src/research-brief.mjs';

const sources = [
  ['https://example.com/a', 'Source A'],
  ['https://example.com/b', 'Source B'],
  ['https://example.com/c', 'Source C'],
  ['https://example.com/d', 'Source D']
];
const sourceMap = new Map(sources.map(([url, title]) => [url, { url, title }]));

const twoSourceBrief = {
  thesis: '테스트 논지',
  keyFacts: [
    { claim: '첫 번째 사실', sourceTitle: 'wrong title', sourceUrl: 'https://example.com/a' },
    { claim: '두 번째 사실', sourceTitle: 'wrong title', sourceUrl: 'https://example.com/a' },
    { claim: '세 번째 사실', sourceTitle: 'wrong title', sourceUrl: 'https://example.com/b' },
    { claim: '네 번째 사실', sourceTitle: 'wrong title', sourceUrl: 'https://example.com/b' }
  ],
  readerQuestions: ['질문 1', '질문 2', '질문 3'],
  contentGap: '차이',
  monetizationFit: '적합',
  caveats: ['주의']
};

let repairCalls = 0;
const repaired = await ensureResearchSourceDiversity({
  ai: async (request) => {
    repairCalls += 1;
    if (!request.instructions.includes('at least 3 distinct sourceUrl')) {
      throw new Error('Repair prompt must require at least three distinct source URLs.');
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
  brief: twoSourceBrief,
  topic: { topic: '테스트 주제', primaryKeyword: 'test topic' },
  sourceMap,
  evidenceText: 'mock evidence'
});

if (repairCalls !== 1) throw new Error(`Expected one repair call, got ${repairCalls}.`);
if (!repaired.repaired || repaired.sourceCount !== 4) throw new Error('Two-source brief was not repaired to four distinct sources.');
if (repaired.brief.keyFacts.some((fact) => fact.sourceTitle === 'ignored')) throw new Error('Whitelisted canonical source titles must replace model-provided titles.');

repairCalls = 0;
const alreadyDiverse = await ensureResearchSourceDiversity({
  ai: async () => { repairCalls += 1; throw new Error('Repair should not run for an already diverse brief.'); },
  brief: {
    ...twoSourceBrief,
    keyFacts: [
      { claim: 'A', sourceTitle: 'x', sourceUrl: 'https://example.com/a' },
      { claim: 'B', sourceTitle: 'x', sourceUrl: 'https://example.com/b' },
      { claim: 'C', sourceTitle: 'x', sourceUrl: 'https://example.com/c' },
      { claim: 'D', sourceTitle: 'x', sourceUrl: 'https://example.com/c' }
    ]
  },
  topic: { topic: '테스트 주제' },
  sourceMap,
  evidenceText: 'mock evidence'
});

if (repairCalls !== 0) throw new Error('Repair ran unnecessarily.');
if (alreadyDiverse.sourceCount !== 3) throw new Error('Expected three distinct whitelisted sources without repair.');

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
    brief: twoSourceBrief,
    topic: { topic: '테스트 주제' },
    sourceMap,
    evidenceText: 'mock evidence'
  });
} catch (error) {
  failedClosed = error.code === 'RESEARCH_SOURCE_DIVERSITY';
}
if (!failedClosed) throw new Error('Source diversity must fail closed when repair still has fewer than three sources.');

console.log('Research source diversity policy OK: 3-source hard gate is preserved, compact repair runs only when needed, and failures remain fail-closed.');
