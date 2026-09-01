import http from 'node:http';
import { structuredResponse } from '../src/ollama.mjs';
import { KOREAN_FIRST_SYSTEM_RULES, koreanLanguageIssues, koreanTextStats } from '../src/language.mjs';

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
for (const field of ['article.title', 'article.description', 'article.category', 'article.tags', 'article.body', 'article.faq']) {
  if (!badArticleIssues.some((issue) => issue.startsWith(field))) throw new Error(`Missing Korean publication guard for ${field}`);
}

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
  console.log('Korean-first language policy OK: discovery candidates normalize locally without blocking, while article publication remains hard-gated.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
