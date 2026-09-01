import { renderArticle } from '../src/render.mjs';

const config = {
  site: { name: 'AI로 일하는 법', baseUrl: 'https://example.com/blog', author: 'Test' },
  research: { audienceSegments: [{ id: 'knowledge-worker', label: '직장인·지식근로자' }] },
  monetization: { adsensePolicy: { reachPlacements: 2, commercialPlacements: 1, authorityPlacements: 1 } }
};
const article = { category: '업무 자동화', sections: [], tags: [] };
const qa = {
  score: 90,
  revisedTitle: '테스트',
  revisedDescription: '테스트 설명',
  revisedSections: Array.from({ length: 6 }, (_, i) => ({ heading: `섹션 ${i + 1}`, paragraphs: ['충분한 본문'], bullets: [] })),
  revisedFaq: [],
  verifiedSources: []
};
const monetization = { adsense: { client: 'ca-pub-test', slot: '111', midSlot: '222' }, affiliateLinks: [], affiliateDisclosure: '' };
const base = { config, article, qa, monetization, date: '2026-08-27', slug: 'test', visuals: null, commonsPhoto: null };
for (const [role, expected] of [['reach', 2], ['commercial', 1], ['authority', 1]]) {
  const html = renderArticle({ ...base, topic: { audienceSegment: 'knowledge-worker', contentRole: role } });
  const count = (html.match(/data-ad-placement=/g) || []).length;
  if (count !== expected) throw new Error(`${role} expected ${expected} ads, got ${count}`);
}
const noAds = renderArticle({ ...base, topic: { audienceSegment: 'knowledge-worker', contentRole: 'reach' }, monetization: { adsense: {}, affiliateLinks: [], affiliateDisclosure: '' } });
if (noAds.includes('data-ad-placement=')) throw new Error('AdSense must stay disabled when credentials are absent.');
console.log('Render policy OK: role-aware AdSense placement and no-secret fallback verified.');
