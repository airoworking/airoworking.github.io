import { readFile } from 'node:fs/promises';
import { renderArticle, renderIndex } from '../src/render.mjs';

const config = {
  site: {
    name: 'AI로 일하는 법',
    description: 'AI와 자동화로 반복업무를 줄이는 실용 가이드',
    baseUrl: 'https://example.com/blog',
    author: 'Test'
  },
  content: { maxPostsOnIndex: 60 },
  research: {
    audienceSegments: [
      { id: 'knowledge-worker', label: '직장인·지식근로자' },
      { id: 'small-business', label: '소규모 사업자' },
      { id: 'freelancer', label: '프리랜서·1인 사업자' },
      { id: 'creator', label: '콘텐츠 제작자' },
      { id: 'developer', label: '개발자·AI 실무자' }
    ]
  },
  monetization: { adsensePolicy: { reachPlacements: 2, commercialPlacements: 1, authorityPlacements: 1 } }
};

const posts = [
  {
    title: '회의록 자동화 가이드',
    slug: 'meeting-notes',
    description: '회의 기록을 더 빠르게 정리하는 방법',
    category: '업무 자동화',
    date: '2026-08-27',
    tags: ['회의', '생산성'],
    audienceSegment: 'knowledge-worker',
    contentRole: 'reach',
    visuals: null
  },
  {
    title: 'AI 도구 A vs B',
    slug: 'tool-a-vs-b',
    description: '선택 기준을 비교합니다.',
    category: 'AI 도구',
    date: '2026-08-26',
    tags: ['비교'],
    audienceSegment: 'small-business',
    contentRole: 'commercial',
    visuals: null
  }
];

const indexHtml = renderIndex(config, posts);
for (const required of [
  'id="audiences"',
  'id="commercial"',
  'id="latest"',
  'id="audience-knowledge-worker"',
  'id="audience-small-business"',
  'class="audience-grid"',
  'class="primary-nav"',
  'class="featured-grid"',
  'class="skip-link"',
  'aria-label="주요 메뉴"',
  '<meta name="viewport"'
]) {
  if (!indexHtml.includes(required)) throw new Error(`Homepage design missing ${required}`);
}

const qa = {
  score: 94,
  revisedTitle: '회의록 AI 자동화 실전 가이드',
  revisedDescription: '도구 선택부터 실제 적용까지 빠르게 판단할 수 있게 정리합니다.',
  revisedSections: [
    { heading: '무엇을 자동화할까', paragraphs: ['반복되는 회의 기록을 줄이는 방법입니다.'], bullets: ['먼저 입력과 출력 형식을 정합니다.'] },
    { heading: '도구 비교와 선택', paragraphs: ['도구별 장단점을 비교합니다.'], bullets: ['업무 환경에 맞는 도구를 고릅니다.'] },
    { heading: '설정 단계', paragraphs: ['단계별로 설정합니다.'], bullets: ['권한을 확인합니다.'] },
    { heading: '주의할 점', paragraphs: ['보안과 개인정보를 확인합니다.'], bullets: [] },
    { heading: '추천 기준', paragraphs: ['상황별 추천 기준입니다.'], bullets: [] }
  ],
  revisedFaq: [{ question: '무료로 가능한가요?', answer: '도구에 따라 가능합니다.' }],
  verifiedSources: [
    { title: 'Source 1', url: 'https://example.com/1' },
    { title: 'Source 2', url: 'https://example.com/2' },
    { title: 'Source 3', url: 'https://example.com/3' }
  ]
};
const article = { category: '업무 자동화', tags: ['회의'], sections: qa.revisedSections };
const topic = {
  audienceSegment: 'knowledge-worker',
  contentRole: 'reach',
  readerProblem: '회의록 정리에 시간이 너무 오래 걸린다.',
  expectedOutcome: '자신에게 맞는 자동화 방식과 도구를 고를 수 있습니다.'
};
const monetization = { adsense: {}, affiliateLinks: [], affiliateDisclosure: '' };
const articleHtml = renderArticle({
  config, topic, article, qa, monetization, date: '2026-08-27',
  slug: 'meeting-notes', visuals: null, commonsPhoto: null
});

for (const required of [
  'class="reader-fit"',
  'class="quick-summary"',
  'class="toc"',
  'class="explore-more"',
  '검증 출처 3개',
  '이 글이 도움이 되는 사람',
  '읽고 나면',
  'type-comparison',
  'type-steps',
  'type-warning',
  'type-decision'
]) {
  if (!articleHtml.includes(required)) throw new Error(`Article design missing ${required}`);
}
if (articleHtml.includes('Quality 94/100') || articleHtml.includes('Quality 94')) {
  throw new Error('Internal QA score must not be exposed as public trust UI.');
}

const css = await readFile('public/styles.css', 'utf8');
for (const required of [
  '-webkit-text-size-adjust:100%',
  '.skip-link:focus',
  ':focus-visible',
  'min-height:44px',
  '@media(max-width:800px)',
  '@media(max-width:480px)',
  '@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)',
  '.site-header{position:static}',
  '.audience-grid{grid-template-columns:1fr}',
  '.featured-grid,.card-grid{grid-template-columns:1fr'
]) {
  if (!css.includes(required)) throw new Error(`Accessibility/mobile CSS policy missing ${required}`);
}
if (/\.hero h1\{[^}]*78px/.test(css)) throw new Error('Homepage hero typography regressed to oversized landing-page scale.');
if (!css.includes('.hero-proof{display:none}')) throw new Error('Decorative SaaS-style proof card should stay hidden in the editorial redesign.');
if (!css.includes('.card-cover{display:none}')) throw new Error('Homepage cards should remain text-first instead of repeating generated SVG covers.');

console.log('Design policy OK: editorial layout, keyboard access, touch targets, responsive 320px-friendly layout, reduced motion, and higher-contrast preferences are enforced.');
