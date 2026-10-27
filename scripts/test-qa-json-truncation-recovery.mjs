import { createServer } from 'node:http';
import { strict as assert } from 'node:assert';
import { structuredResponse } from '../src/ollama.mjs';

// Run #74: three qwen3:1.7b QA attempts ended in an unterminated JSON
// string while generating a full section revision. Recovery must request a
// fresh, independent, compact verdict, not synthesize a passing QA score.
const sectionSchema = {
  type: 'object',
  properties: {
    heading: { type: 'string' },
    paragraphs: { type: 'array', items: { type: 'string' } },
    bullets: { type: 'array', items: { type: 'string' } }
  },
  required: ['heading', 'paragraphs', 'bullets']
};
const sourceSchema = {
  type: 'object',
  properties: { title: { type: 'string' }, url: { type: 'string' } },
  required: ['title', 'url']
};
const faqSchema = {
  type: 'object',
  properties: { question: { type: 'string' }, answer: { type: 'string' } },
  required: ['question', 'answer']
};
const schema = {
  type: 'object',
  properties: {
    score: { type: 'integer' },
    approved: { type: 'boolean' },
    revisedTitle: { type: 'string' },
    revisedDescription: { type: 'string' },
    revisedSections: { type: 'array', items: sectionSchema },
    revisedFaq: { type: 'array', items: faqSchema },
    verifiedSources: { type: 'array', items: sourceSchema },
    warnings: { type: 'array', items: { type: 'string' } },
    verificationSummary: { type: 'string' },
    visualPlan: {
      type: 'object',
      properties: {
        photoNeeded: { type: 'boolean' },
        photoSearchQuery: { type: 'string' },
        photoReason: { type: 'string' }
      },
      required: ['photoNeeded', 'photoSearchQuery', 'photoReason']
    }
  },
  required: [
    'score', 'approved', 'revisedTitle', 'revisedDescription', 'revisedSections',
    'revisedFaq', 'verifiedSources', 'warnings', 'verificationSummary', 'visualPlan'
  ]
};
const draft = {
  title: '콘텐츠 자동화 도구 비교',
  description: '콘텐츠 자동화 도구의 선택 기준을 정리합니다.',
  sections: Array.from({ length: 5 }, (_, index) => ({
    heading: `선택 기준 ${index + 1}`,
    paragraphs: ['공개 근거를 확인한 뒤 업무에 맞는 도구를 선택해야 합니다.'],
    bullets: []
  })),
  faq: [
    { question: '어디부터 시작하나요?', answer: '업무 조건부터 확인합니다.' },
    { question: '무엇을 비교하나요?', answer: '근거와 제약을 비교합니다.' }
  ],
  sources: [
    { title: '공식 자료 하나', url: 'https://example.com/1' },
    { title: '공식 자료 둘', url: 'https://example.com/2' },
    { title: '공식 자료 셋', url: 'https://example.com/3' }
  ]
};
const rejectedVerdict = {
  score: 0,
  approved: false,
  revisedTitle: draft.title,
  revisedDescription: draft.description,
  revisedFaq: draft.faq,
  verifiedSources: draft.sources,
  warnings: ['본문에 추가 사실 검증이 필요하여 발행을 승인할 수 없습니다.'],
  verificationSummary: '검증이 부족한 문단이 남아 있습니다.',
  visualPlan: { photoNeeded: false, photoSearchQuery: '', photoReason: '사진이 필요하지 않습니다.' },
  sectionRevisions: []
};
const seenSchemas = [];
const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/tags') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [] }));
    return;
  }
  assert.equal(req.url, '/api/chat');
  let body = '';
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  seenSchemas.push(payload.format);
  const content = seenSchemas.length <= 3
    ? '{"score":0,"approved":false,"sectionRevisions":[{"sectionIndex":0,"heading":"수정이 필요한 문단'
    : JSON.stringify(rejectedVerdict);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: { content }, eval_count: 1600 }));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  const result = await structuredResponse({
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: 'qa-test-model',
    schema,
    instructions: '독립적으로 원고의 사실관계를 검토하고 근거 없는 주장은 승인하지 마세요.',
    input: `Minimum passing score: 85\nDraft: ${JSON.stringify(draft)}\n\nPUBLIC EVIDENCE:\n공식 자료에서 검증할 수 있는 내용만 허용합니다.`,
    timeoutMs: 10_000,
    maxOutputTokens: 1600
  });
  assert.equal(seenSchemas.length, 4, 'Three truncated full reviews must lead to one compact review.');
  for (const fullSchema of seenSchemas.slice(0, 3)) {
    assert.equal(fullSchema.properties.sectionRevisions.maxItems, 2, 'Normal QA may revise two sections.');
  }
  assert.equal(seenSchemas[3].properties.sectionRevisions.maxItems, 0, 'Recovery must prohibit body rewrites.');
  assert.equal(seenSchemas[3].properties.sectionRevisions.minItems, 0, 'Recovery must require an empty revision list.');
  assert.equal(result.data.approved, false, 'Recovery must honor the independent rejected verdict.');
  assert.equal(result.data.score, 0, 'Recovery must never fabricate a passing QA score.');
  assert.deepEqual(result.data.revisedSections.map((s) => s.heading), draft.sections.map((s) => s.heading));
  assert.equal(result.data.verifiedSources.length, 3, 'Recovery must preserve the actual reviewer source verdict.');
  console.log('Run #74 QA JSON-truncation recovery: compact independent rejection and fail-closed policy OK.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
