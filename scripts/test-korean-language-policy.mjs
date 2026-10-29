import http from 'node:http';
import { structuredResponse } from '../src/ollama.mjs';
import { KOREAN_FIRST_SYSTEM_RULES, koreanLanguageIssues, koreanTextStats, koreanizeArticleCategory } from '../src/language.mjs';

const topicSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array', minItems: 1, maxItems: 1,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          primaryKeyword: { type: 'string' },
          audienceSegment: { type: 'string' },
          readerProblem: { type: 'string' },
          expectedOutcome: { type: 'string' }
        },
        required: ['topic', 'primaryKeyword', 'audienceSegment', 'readerProblem', 'expectedOutcome']
      }
    }
  },
  required: ['candidates']
};

const englishCandidate = {
  candidates: [{
    topic: 'Best AI coding tools for developers',
    primaryKeyword: 'AI coding tools',
    audienceSegment: 'developer',
    readerProblem: 'Developers need to choose the right coding assistant',
    expectedOutcome: 'Better productivity and code quality'
  }]
};

const issues = koreanLanguageIssues(topicSchema, englishCandidate);
if (issues.length) throw new Error(`Transient topic candidates must not hard-fail: ${issues.join(' | ')}`);
const normalized = englishCandidate.candidates[0];
if (normalized.primaryKeyword !== 'AI coding tools') throw new Error('Search keyword must stay unchanged during Korean normalization.');
for (const field of ['topic', 'readerProblem', 'expectedOutcome']) {
  if (koreanTextStats(normalized[field]).hangul < 3) throw new Error(`Selected-facing topic field was not normalized to Korean: ${field}`);
}
if (!KOREAN_FIRST_SYSTEM_RULES.includes('proper product/brand/model names')) {
  throw new Error('Korean-first system rules must preserve established product names.');
}

const articleLikeSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    sections: { type: 'array', items: { type: 'object' } },
    faq: { type: 'array', items: { type: 'object' } }
  }
};
const badArticle = {
  title: 'AI Coding Tools in 2026',
  description: 'A guide to choosing coding assistants for developers and improving productivity.',
  category: 'Developer Tools',
  tags: ['AI', 'coding assistants'],
  sections: [{ heading: 'Introduction', paragraphs: ['This is an English article body that should not be published on a Korean-first site.'] }],
  faq: [{ question: 'Which tool is best?', answer: 'It depends on the workflow.' }]
};
const badArticleIssues = koreanLanguageIssues(articleLikeSchema, badArticle);
if (badArticle.category !== '개발·AI 도구') throw new Error(`English developer category was not normalized locally: ${badArticle.category}`);
for (const field of ['article.title', 'article.description', 'article.tags', 'article.body', 'article.faq']) {
  if (!badArticleIssues.some((issue) => issue.startsWith(field))) throw new Error(`Missing Korean publication guard for ${field}`);
}
if (badArticleIssues.some((issue) => issue.startsWith('article.category'))) {
  throw new Error('A locally normalizable English category must not trigger whole-article language repair.');
}

// Regression from Automated Blog Publisher run #30 (2026-09-13): the draft was
// otherwise Korean-first, but an English category triggered a complete second draft
// generation. That slow repair took 1289 seconds and shrank the article to 1125 chars,
// causing the later QA timeout fallback to reject it. Low-entropy category metadata
// must be normalized deterministically without touching the article body.
const run30Article = {
  title: '스프레드시트 자동화 도구를 고르는 실전 기준',
  description: '반복되는 표 계산과 정리 작업을 줄이려는 직장인을 위한 가이드입니다. 도구를 고를 때 확인할 기준과 안전한 적용 순서를 설명합니다.',
  category: 'Spreadsheet Automation',
  tags: ['AI 자동화', '스프레드시트', '업무 생산성'],
  sections: [
    {
      heading: '먼저 자동화할 업무를 좁히기',
      paragraphs: ['스프레드시트 자동화는 모든 작업을 한 번에 바꾸기보다 반복 빈도가 높고 입력과 출력이 명확한 업무부터 적용하는 편이 안전합니다. 기존 절차에서 사람이 확인해야 하는 지점과 자동으로 처리해도 되는 지점을 나누면 도구 선택 기준도 더 분명해집니다.']
    },
    {
      heading: '도구 선택 기준 확인하기',
      paragraphs: ['연동 범위와 데이터 처리 방식, 오류가 났을 때 되돌릴 수 있는지 확인해야 합니다. 특히 중요한 업무 데이터는 외부 서비스로 전송되는 범위와 접근 권한을 먼저 살피고 작은 샘플로 결과를 검증한 뒤 적용 범위를 넓히는 것이 좋습니다.']
    }
  ],
  faq: [
    { question: '처음에는 어떤 업무부터 자동화해야 하나요?', answer: '반복 빈도가 높고 입력과 결과를 사람이 쉽게 검증할 수 있는 단순 작업부터 시작하는 것이 좋습니다.' },
    { question: '자동화 결과를 바로 실무에 써도 되나요?', answer: '처음에는 샘플 데이터로 검증하고 오류가 발생했을 때 되돌릴 방법을 확인한 뒤 적용 범위를 단계적으로 넓히는 것이 안전합니다.' }
  ]
};
const run30BodyBefore = JSON.stringify(run30Article.sections);
const run30Issues = koreanLanguageIssues(articleLikeSchema, run30Article);
if (run30Issues.length) throw new Error(`Run #30 category-only regression should pass after local normalization: ${run30Issues.join(' | ')}`);
if (run30Article.category !== '업무 생산성') throw new Error(`Run #30 category should normalize to 업무 생산성, got ${run30Article.category}`);
if (JSON.stringify(run30Article.sections) !== run30BodyBefore) throw new Error('Category normalization must never rewrite or shrink article sections.');
if (koreanizeArticleCategory('AI Security and Privacy') !== 'AI 보안·개인정보') throw new Error('Security category mapping regressed.');
if (koreanizeArticleCategory('Open Source Self Hosted AI') !== '셀프호스팅 AI') throw new Error('Self-hosted category mapping regressed.');

let chatCalls = 0;
let firstRequest;
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
    firstRequest ||= JSON.parse(raw);
    chatCalls += 1;
    const content = {
      candidates: [{
        topic: 'Best AI coding tools for developers',
        primaryKeyword: 'AI coding tools',
        audienceSegment: 'developer',
        readerProblem: 'Developers need to choose the right coding assistant',
        expectedOutcome: 'Better productivity and code quality'
      }]
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: { content: JSON.stringify(content) }, eval_count: 100, total_duration: 1 }));
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
try {
  const result = await structuredResponse({
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: 'korean-policy-test',
    schema: topicSchema,
    instructions: 'Choose a useful topic.',
    input: 'Use the supplied evidence.',
    timeoutMs: 3000,
    maxOutputTokens: 300,
    contextWindow: 2048
  });

  if (chatCalls !== 1) throw new Error(`Topic discovery should no longer spend a second model call on whole-list translation; got ${chatCalls} calls.`);
  const candidate = result.data.candidates[0];
  if (candidate.primaryKeyword !== 'AI coding tools') throw new Error('Structured topic normalization changed the research keyword.');
  for (const field of ['topic', 'readerProblem', 'expectedOutcome']) {
    if (koreanTextStats(candidate[field]).hangul < 3) throw new Error(`Structured topic normalization failed for ${field}`);
  }
  const systemPrompt = firstRequest?.messages?.[0]?.content || '';
  if (!systemPrompt.includes('Korean-first publication language policy')) throw new Error('Korean-first system policy was not applied to the model call.');
  console.log('Korean-first language policy OK: discovery candidates and low-entropy draft categories normalize locally without blocking, while substantive article fields remain hard-gated.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}

// Regression for Automated Blog Publisher run #76 (2026-10-29): the draft body
// was Korean, but English-heavy section headings (17% Hangul) triggered a
// costly full-article rewrite that still failed the Korean-first gate.
// Repair only headings and preserve every paragraph, citation, and metadata field.
const run76Draft = structuredClone(run30Article);
run76Draft.sections[0].heading = '도구 선택 기준 ' + 'AI Tools for Freelancers and Solo Business Owners '.repeat(4);
run76Draft.sections[1].heading = '실무 적용 순서 ' + 'Practical Automation Workflow and Productivity Tools '.repeat(4);
const run76Issues = koreanLanguageIssues(articleLikeSchema, structuredClone(run76Draft));
if (run76Issues.length !== 1 || !run76Issues[0].startsWith('article.sectionHeadings')) {
  throw new Error(`Run #76 fixture must fail only the heading language gate: ${run76Issues.join(' | ')}`);
}
let headingRepairCalls = 0;
const headingServer = http.createServer((req, res) => {
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const request = JSON.parse(raw);
    headingRepairCalls += 1;
    let output;
    if (headingRepairCalls === 1) {
      output = run76Draft;
    } else if (headingRepairCalls === 2) {
      if (request.format?.properties?.headings?.minItems !== 2 ||
          request.format?.properties?.headings?.maxItems !== 2 ||
          request.format?.properties?.sections) {
        throw new Error('Run #76 repair must request exactly two headings, not the whole article.');
      }
      output = { headings: ['프리랜서가 AI 도구를 선택하는 기준', '업무 자동화를 실제로 적용하는 순서'] };
    } else {
      throw new Error('Run #76 should not regenerate the full article.');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: { content: JSON.stringify(output) }, eval_count: 100 }));
  });
});
await new Promise((resolve) => headingServer.listen(0, '127.0.0.1', resolve));
try {
  const result = await structuredResponse({
    baseUrl: `http://127.0.0.1:${headingServer.address().port}`,
    model: 'run76-heading-test',
    schema: articleLikeSchema,
    instructions: 'Write a Korean article.',
    input: 'Use only supplied evidence.',
    timeoutMs: 3000,
    maxOutputTokens: 500,
    contextWindow: 2048
  });
  if (headingRepairCalls !== 2) throw new Error(`Expected one draft and one targeted repair, got ${headingRepairCalls} calls.`);
  if (koreanLanguageIssues(articleLikeSchema, result.data).length) throw new Error('Run #76 heading repair did not pass the Korean-first policy.');
  const unchanged = { ...result.data, sections: result.data.sections.map((section, index) => ({ ...section, heading: run76Draft.sections[index].heading })) };
  if (JSON.stringify(unchanged) !== JSON.stringify(run76Draft)) {
    throw new Error('Headings-only repair changed article body or metadata.');
  }
  console.log('Run #76 headings-only repair regression OK: Korean headings pass while article body remains unchanged.');
} finally {
  await new Promise((resolve) => headingServer.close(resolve));
}
