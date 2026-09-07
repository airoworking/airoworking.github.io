import { readFile } from 'node:fs/promises';
import { normalizeTopicCandidate } from '../src/topic-candidates.mjs';

const config = JSON.parse(await readFile(new URL('../config/blog.config.json', import.meta.url), 'utf8'));
const audienceSegments = config.research.audienceSegments;
const audienceIds = audienceSegments.map((segment) => segment.id);
const contentRoles = ['reach', 'commercial', 'authority'];
const monetizationRoutes = ['adsense', 'affiliate', 'digital-product', 'lead', 'mixed', 'none'];
const options = { audienceSegments, audienceIds, contentRoles, monetizationRoutes };

const cases = [
  {
    input: {
      topic: '소규모 사업자를 위한 고객지원 AI 도구 비교',
      primaryKeyword: 'customer support automation',
      audienceSegment: 'small business owners',
      contentRole: 'comparison',
      monetizationRoute: 'affiliate marketing',
      readerProblem: '고객 문의를 반복해서 처리하는 시간이 길다.',
      expectedOutcome: '도구별 차이를 이해하고 선택한다.',
      searchIntent: 'product comparison',
      monetizationAngle: 'affiliate'
    },
    expected: ['small-business', 'commercial', 'affiliate']
  },
  {
    input: {
      topic: 'RAG 워크플로 보안과 운영 설계',
      primaryKeyword: 'RAG workflow security',
      audienceSegment: '개발자·AI 실무자',
      contentRole: 'deep dive',
      monetizationRoute: 'digital product',
      readerProblem: '운영 환경의 보안과 비용 trade-off를 판단하기 어렵다.',
      expectedOutcome: '구축 기준을 정한다.',
      searchIntent: 'implementation security',
      monetizationAngle: 'template'
    },
    expected: ['developer', 'authority', 'digital-product']
  },
  {
    input: {
      topic: '스프레드시트 반복업무 자동화 초보자 가이드',
      primaryKeyword: 'spreadsheet automation',
      audienceSegment: 'general audience',
      contentRole: 'informational',
      monetizationRoute: 'unknown',
      readerProblem: '반복 입력과 정리에 시간이 많이 든다.',
      expectedOutcome: '자동화 시작 지점을 찾는다.',
      searchIntent: 'how to',
      monetizationAngle: ''
    },
    expected: ['knowledge-worker', 'reach', 'none']
  },
  {
    input: {
      topic: '콘텐츠 재활용 자동화',
      primaryKeyword: 'content repurposing automation',
      audienceSegment: 'creator',
      contentRole: 'commercial',
      monetizationRoute: 'adsense',
      readerProblem: '한 콘텐츠를 여러 채널로 재활용하는 데 시간이 든다.',
      expectedOutcome: '자동화 도구 선택 기준을 세운다.',
      searchIntent: 'tool selection',
      monetizationAngle: 'adsense'
    },
    expected: ['creator', 'commercial', 'adsense'],
    noRepair: true
  }
];

for (const [index, testCase] of cases.entries()) {
  const { candidate, repairs } = normalizeTopicCandidate(testCase.input, options);
  const actual = [candidate.audienceSegment, candidate.contentRole, candidate.monetizationRoute];
  if (actual.join('|') !== testCase.expected.join('|')) {
    throw new Error(`Case ${index + 1} normalization mismatch: expected ${testCase.expected.join('/')}, got ${actual.join('/')}.`);
  }
  if (!audienceIds.includes(candidate.audienceSegment)) throw new Error(`Case ${index + 1} returned invalid audienceSegment.`);
  if (!contentRoles.includes(candidate.contentRole)) throw new Error(`Case ${index + 1} returned invalid contentRole.`);
  if (!monetizationRoutes.includes(candidate.monetizationRoute)) throw new Error(`Case ${index + 1} returned invalid monetizationRoute.`);
  if (testCase.noRepair && repairs.length) throw new Error(`Case ${index + 1} should not repair canonical metadata: ${repairs.join(' | ')}`);
}

console.log(`Topic candidate policy OK: ${cases.length} canonicalization and fallback cases passed.`);
