import http from 'node:http';
import { structuredResponse } from '../src/ollama.mjs';

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

const faqSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { question: { type: 'string' }, answer: { type: 'string' } },
  required: ['question', 'answer']
};

const draftLikeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    sections: { type: 'array', minItems: 2, maxItems: 3, items: sectionSchema }
  },
  required: ['title', 'slug', 'sections']
};

const qaLikeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    revisedTitle: { type: 'string' },
    revisedDescription: { type: 'string' },
    revisedSections: { type: 'array', minItems: 2, maxItems: 3, items: sectionSchema },
    revisedFaq: { type: 'array', minItems: 1, maxItems: 2, items: faqSchema }
  },
  required: ['revisedTitle', 'revisedDescription', 'revisedSections', 'revisedFaq']
};

let draftCalls = 0;
let qaPrimaryCalls = 0;
let expansionCalls = 0;
let legacyAdditionCalls = 0;
const requestBodies = [];

function response(res, payload, evalCount = 100) {
  res.end(JSON.stringify({
    message: { content: JSON.stringify(payload) },
    eval_count: evalCount,
    total_duration: 1
  }));
}

function qaPayload(sections) {
  return {
    revisedTitle: '업무 자동화를 시작할 때 먼저 정할 것',
    revisedDescription: '도구보다 업무 흐름을 먼저 정리하고, 자동화할 일과 사람이 판단할 일을 나누는 방법을 설명합니다.',
    sections,
    revisedFaq: [{
      question: '자동화는 어디서부터 시작하는 게 좋나요?',
      answer: '반복 빈도가 높고 판단 기준이 명확한 업무부터 작게 시작한 뒤 결과를 확인하며 범위를 넓히는 편이 안전합니다.'
    }]
  };
}

const server = http.createServer((req, res) => {
  if (req.url !== '/api/chat') {
    res.writeHead(404);
    res.end();
    return;
  }
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const requestBody = JSON.parse(raw);
    requestBodies.push(requestBody);
    res.writeHead(200, { 'content-type': 'application/json' });
    const props = requestBody.format?.properties || {};

    if (props.additions) {
      legacyAdditionCalls += 1;
      response(res, { additions: [] });
      return;
    }

    if (props.title && props.sections) {
      draftCalls += 1;
      const short = '검증된 사실만 남긴 짧은 작업 초안입니다. '.repeat(12);
      response(res, {
        title: '테스트 초안',
        sections: [
          { heading: '현재 업무부터 살펴보기', paragraphs: [short], bullets: [] },
          { heading: '자동화 범위 정하기', paragraphs: [short], bullets: [] }
        ]
      });
      return;
    }

    if (props.revisedTitle && props.sections) {
      qaPrimaryCalls += 1;
      const wantsExpansion = String(requestBody.messages?.at(-1)?.content || '').includes('TRIGGER_EXPANSION');
      const paragraph = '핵심 판단 기준을 먼저 설명하는 검증된 본문입니다. '.repeat(12);
      const usefulBullet = '실제 적용에서는 현재 업무의 입력과 출력, 담당자, 예외 상황을 먼저 적어 두면 자동화 도구를 고르기 전에 무엇을 바꿔야 하는지가 보입니다. 근거에 없는 기능이나 성과를 덧붙이지 않고, 사람이 확인해야 할 지점과 자동으로 처리해도 되는 지점을 분리해서 작은 범위부터 검증하는 편이 안전합니다. '.repeat(5);
      const sections = wantsExpansion
        ? [
            { heading: '현재 업무부터 살펴보기', paragraphs: [paragraph], bullets: [] },
            { heading: '자동화 범위 정하기', paragraphs: [paragraph], bullets: [] }
          ]
        : [
            { heading: '현재 업무부터 살펴보기', paragraphs: [paragraph], bullets: [usefulBullet, usefulBullet.replace('현재 업무', '반복 업무')] },
            { heading: '자동화 범위 정하기', paragraphs: [paragraph], bullets: [usefulBullet.replace('현재 업무', '업무 흐름'), usefulBullet.replace('현재 업무', '운영 과정')] }
          ];
      response(res, qaPayload(sections));
      return;
    }

    if (props.sections && !props.title && !props.revisedTitle) {
      expansionCalls += 1;
      const expanded = '입력 자료에 확인된 범위 안에서 실제 적용 순서와 선택 기준을 더 자세히 풀어 설명합니다. 먼저 반복 업무의 시작 조건과 완료 조건을 적고, 사람이 판단해야 하는 예외를 따로 표시하면 자동화 범위를 과도하게 넓히는 실수를 줄일 수 있습니다. 작은 범위로 시험한 뒤 누락과 오류를 확인하고 다음 단계로 확장하는 방식이 유지 관리에도 유리합니다. '.repeat(6);
      response(res, {
        sections: [
          { heading: '현재 업무부터 살펴보기', paragraphs: [expanded, expanded.replace('반복 업무', '고객 응대 업무')], bullets: [] },
          { heading: '자동화 범위 정하기', paragraphs: [expanded.replace('반복 업무', '문서 업무'), expanded.replace('반복 업무', '운영 업무')], bullets: [] }
        ]
      }, 500);
      return;
    }

    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Unexpected test request shape' }));
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();

try {
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const draft = await structuredResponse({
    baseUrl,
    model: 'depth-repair-test',
    schema: draftLikeSchema,
    instructions: 'Write only from supplied evidence.',
    input: 'ORIGINAL EVIDENCE: verified facts only.',
    timeoutMs: 3000,
    maxOutputTokens: 100,
    contextWindow: 2048
  });
  const draftChars = draft.data.sections.flatMap((section) => section.paragraphs).join('').length;
  if (draftChars >= 1000) throw new Error(`Fixture must exercise a sub-1000-char draft handoff, got ${draftChars}.`);
  if (draft.data.slug !== '') throw new Error('Draft handoff wrapper should synthesize an empty slug for downstream fallback.');

  const beforeBulletQaExpansionCalls = expansionCalls;
  const bulletRichQa = await structuredResponse({
    baseUrl,
    model: 'depth-repair-test',
    schema: qaLikeSchema,
    instructions: 'Fact check using only supplied evidence.',
    input: 'ORIGINAL EVIDENCE: verified facts only.',
    timeoutMs: 3000,
    maxOutputTokens: 100,
    contextWindow: 2048
  });
  const bulletQaChars = bulletRichQa.data.revisedSections.flatMap((section) => section.paragraphs).join('').length;
  if (bulletQaChars < 3500) throw new Error(`Substantive list content was not promoted into final prose: ${bulletQaChars}.`);
  if (expansionCalls !== beforeBulletQaExpansionCalls) throw new Error('Bullet-rich QA should not require another model expansion call.');

  const expansionQa = await structuredResponse({
    baseUrl,
    model: 'depth-repair-test',
    schema: qaLikeSchema,
    instructions: 'Fact check using only supplied evidence.',
    input: 'TRIGGER_EXPANSION\nORIGINAL EVIDENCE: verified facts only.',
    timeoutMs: 3000,
    maxOutputTokens: 100,
    contextWindow: 2048
  });
  const expandedChars = expansionQa.data.revisedSections.flatMap((section) => section.paragraphs).join('').length;
  if (expandedChars < 3500) throw new Error(`One complete section expansion did not clear 3500 chars: ${expandedChars}.`);
  if (expansionCalls !== beforeBulletQaExpansionCalls + 1) throw new Error(`Expected exactly one complete QA expansion call, got ${expansionCalls - beforeBulletQaExpansionCalls}.`);

  if (legacyAdditionCalls !== 0) throw new Error('Legacy additions[] append-only repair must never run for final QA.');
  if (draftCalls !== 1) throw new Error(`Expected one draft generation, got ${draftCalls}.`);
  if (qaPrimaryCalls !== 2) throw new Error(`Expected two QA primary generations, got ${qaPrimaryCalls}.`);

  const qaRequests = requestBodies.filter((body) => body.format?.properties?.revisedTitle && body.format?.properties?.sections);
  if (!qaRequests.length) throw new Error('QA primary request did not use the no-legacy-depth schema.');
  if (qaRequests.some((body) => body.format?.properties?.revisedSections)) throw new Error('QA primary schema still exposes revisedSections and would trigger legacy depth repair.');
  if (qaRequests.some((body) => (body.options?.num_predict || 0) < 4000)) throw new Error('QA primary output budget was not raised to 4000 tokens.');

  const expansionRequest = requestBodies.find((body) => body.format?.properties?.sections && !body.format?.properties?.title && !body.format?.properties?.revisedTitle);
  if (!expansionRequest) throw new Error('No complete sections-only expansion request was issued.');
  if (expansionRequest.format?.properties?.additions) throw new Error('Expansion request unexpectedly used the legacy additions schema.');
  if (!String(expansionRequest.messages?.[0]?.content || '').includes('complete replacement')) throw new Error('Expansion prompt does not clearly request complete replacement sections.');

  console.log(`QA depth recovery OK: short draft=${draftChars} chars; bullet-rich QA=${bulletQaChars}; one-shot expanded QA=${expandedChars}; legacy append repairs=${legacyAdditionCalls}.`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
