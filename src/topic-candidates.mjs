function simplify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[_.\/\\\s]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function configuredDefault(values, preferred) {
  if (values.includes(preferred)) return preferred;
  return values[0] || '';
}

function exactConfigured(value, values) {
  const key = simplify(value);
  return values.find((item) => simplify(item) === key) || '';
}

function aliasMatch(value, aliases, allowed) {
  const key = simplify(value);
  for (const [canonical, variants] of Object.entries(aliases)) {
    if (!allowed.includes(canonical)) continue;
    if (variants.some((variant) => simplify(variant) === key)) return canonical;
  }
  return '';
}

function candidateText(candidate) {
  return simplify([
    candidate?.topic,
    candidate?.primaryKeyword,
    candidate?.readerProblem,
    candidate?.expectedOutcome,
    candidate?.searchIntent,
    candidate?.monetizationAngle
  ].filter(Boolean).join(' '));
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(simplify(term)));
}

function normalizeAudience(value, candidate, audienceSegments, audienceIds) {
  const configured = exactConfigured(value, audienceIds);
  if (configured) return configured;

  const key = simplify(value);
  for (const segment of audienceSegments || []) {
    if (!audienceIds.includes(segment.id)) continue;
    const descriptors = [segment.id, segment.label, segment.searchPhrase];
    if (descriptors.some((descriptor) => simplify(descriptor) === key)) return segment.id;
  }

  const aliases = {
    'knowledge-worker': ['knowledge worker', 'knowledge workers', 'office worker', 'office workers', 'office/knowledge workers', '직장인', '지식근로자', '직장인 지식근로자'],
    'small-business': ['small business', 'small business owner', 'small business owners', 'smb', '소규모 사업자', '소상공인'],
    freelancer: ['freelance', 'freelancer', 'freelancers', 'solo operator', 'solo operators', 'solo business owner', 'solo business owners', '프리랜서', '1인 사업자'],
    creator: ['content creator', 'content creators', 'creator', 'creators', 'marketer', 'marketers', 'content creators marketers', '콘텐츠 제작자', '크리에이터'],
    developer: ['developer', 'developers', 'ai practitioner', 'ai practitioners', 'developers ai practitioners', '개발자', 'ai 실무자', '개발자 ai 실무자']
  };
  const aliased = aliasMatch(value, aliases, audienceIds);
  if (aliased) return aliased;

  const text = candidateText(candidate);
  const inference = [
    ['developer', ['developer', 'coding', 'code', 'rag', 'llm', 'api', 'self-host', 'github', '개발', '코딩']],
    ['creator', ['content', 'creator', 'video', 'podcast', 'newsletter', 'social-media', '콘텐츠', '크리에이터']],
    ['small-business', ['small-business', 'customer-support', 'crm', 'booking', 'sales', '소규모-사업', '고객', '예약']],
    ['freelancer', ['freelancer', 'solo-business', 'client', 'invoice', 'proposal', '프리랜서', '1인-사업', '견적', '청구']],
    ['knowledge-worker', ['spreadsheet', 'document', 'email', 'meeting', 'calendar', 'office', 'knowledge-worker', '스프레드시트', '문서', '이메일', '회의', '직장']]
  ];
  for (const [canonical, terms] of inference) {
    if (audienceIds.includes(canonical) && includesAny(text, terms)) return canonical;
  }
  return configuredDefault(audienceIds, 'knowledge-worker');
}

function normalizeContentRole(value, candidate, contentRoles) {
  const configured = exactConfigured(value, contentRoles);
  if (configured) return configured;

  const aliases = {
    reach: ['informational', 'information', 'guide', 'beginner', 'awareness', 'education', 'educational', 'how-to', 'how to'],
    commercial: ['comparison', 'compare', 'commercial investigation', 'buyer', 'buying', 'pricing', 'alternatives', 'tool selection', 'product comparison'],
    authority: ['deep dive', 'deep-dive', 'technical', 'implementation', 'security', 'architecture', 'advanced', 'expert', 'thought leadership']
  };
  const aliased = aliasMatch(value, aliases, contentRoles);
  if (aliased) return aliased;

  const text = candidateText(candidate);
  if (contentRoles.includes('commercial') && includesAny(text, ['comparison', 'compare', 'pricing', 'alternatives', 'best-tools', 'tool-selection', 'vs', '비교', '가격', '대안', '선택'])) return 'commercial';
  if (contentRoles.includes('authority') && includesAny(text, ['architecture', 'security', 'privacy', 'implementation', 'rag', 'self-host', 'technical', 'advanced', '아키텍처', '보안', '프라이버시', '구축', '심화'])) return 'authority';
  return configuredDefault(contentRoles, 'reach');
}

function normalizeMonetizationRoute(value, candidate, monetizationRoutes) {
  const configured = exactConfigured(value, monetizationRoutes);
  if (configured) return configured;

  const aliases = {
    adsense: ['ad', 'ads', 'advertising', 'display ads', 'google adsense'],
    affiliate: ['affiliate marketing', 'affiliates', 'referral', 'referral links'],
    'digital-product': ['digital product', 'digital products', 'product', 'template', 'templates'],
    lead: ['leads', 'lead gen', 'lead generation'],
    mixed: ['hybrid', 'multiple', 'multi', 'mixed monetization'],
    none: ['no monetization', 'organic', 'editorial', 'n/a', 'na', 'unknown']
  };
  const aliased = aliasMatch(value, aliases, monetizationRoutes);
  if (aliased) return aliased;

  const text = simplify(`${value || ''} ${candidate?.monetizationAngle || ''}`);
  if (monetizationRoutes.includes('affiliate') && includesAny(text, ['affiliate', 'referral', '제휴'])) return 'affiliate';
  if (monetizationRoutes.includes('adsense') && includesAny(text, ['adsense', 'display-ads', 'advertising', '광고'])) return 'adsense';
  if (monetizationRoutes.includes('digital-product') && includesAny(text, ['digital-product', 'template', 'course', '디지털-제품', '템플릿'])) return 'digital-product';
  if (monetizationRoutes.includes('lead') && includesAny(text, ['lead-generation', 'lead-gen', '리드'])) return 'lead';
  if (monetizationRoutes.includes('mixed') && includesAny(text, ['mixed', 'hybrid', '복합'])) return 'mixed';
  return configuredDefault(monetizationRoutes, 'none');
}

function repairField(repairs, field, before, after) {
  if (String(before || '') === String(after || '')) return;
  repairs.push(`${field}: ${JSON.stringify(String(before || ''))} -> ${JSON.stringify(after)}`);
}

export function normalizeTopicCandidate(candidate, {
  audienceSegments = [],
  audienceIds = audienceSegments.map((segment) => segment.id),
  contentRoles = ['reach', 'commercial', 'authority'],
  monetizationRoutes = ['adsense', 'affiliate', 'digital-product', 'lead', 'mixed', 'none']
} = {}) {
  const next = { ...candidate };
  const repairs = [];

  const audienceSegment = normalizeAudience(next.audienceSegment, next, audienceSegments, audienceIds);
  repairField(repairs, 'audienceSegment', next.audienceSegment, audienceSegment);
  next.audienceSegment = audienceSegment;

  const contentRole = normalizeContentRole(next.contentRole, next, contentRoles);
  repairField(repairs, 'contentRole', next.contentRole, contentRole);
  next.contentRole = contentRole;

  const monetizationRoute = normalizeMonetizationRoute(next.monetizationRoute, next, monetizationRoutes);
  repairField(repairs, 'monetizationRoute', next.monetizationRoute, monetizationRoute);
  next.monetizationRoute = monetizationRoute;

  return { candidate: next, repairs };
}
