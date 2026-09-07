const GENERIC_SLUGS = new Set([
  'ai', 'app', 'apps', 'article', 'automation', 'blog', 'content', 'guide', 'post',
  'software', 'tool', 'tools', 'workflow'
]);

export function slugifyAscii(value, maxLength = 80) {
  const limit = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 80;
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, limit)
    .replace(/-+$/g, '');
}

export function isMeaningfulSlug(value) {
  const slug = slugifyAscii(value);
  if (!slug || slug.length < 4) return false;
  if (GENERIC_SLUGS.has(slug)) return false;
  return slug.replace(/-/g, '').length >= 4;
}

function withSuffix(base, suffix, maxLength = 80) {
  const normalizedSuffix = slugifyAscii(suffix, maxLength);
  if (!normalizedSuffix) return slugifyAscii(base, maxLength);
  const tail = `-${normalizedSuffix}`;
  const room = Math.max(1, maxLength - tail.length);
  const head = slugifyAscii(base, room).replace(/-+$/g, '') || 'article';
  return `${head}${tail}`.slice(0, maxLength).replace(/-+$/g, '');
}

export function resolveArticleSlug({
  primaryKeyword,
  preferredSlug,
  title,
  topic,
  date,
  existingSlugs = [],
  maxLength = 80
} = {}) {
  const candidates = [
    ['primaryKeyword', primaryKeyword],
    ['preferredSlug', preferredSlug],
    ['title', title],
    ['topic', topic]
  ].map(([source, value]) => ({ source, raw: value, slug: slugifyAscii(value, maxLength) }));

  const selected = candidates.find((candidate) => isMeaningfulSlug(candidate.slug));
  const dateSlug = slugifyAscii(date, 20);
  const fallback = slugifyAscii(dateSlug ? `article-${dateSlug}` : 'article', maxLength) || 'article';
  const base = selected?.slug || fallback;
  const used = new Set((existingSlugs || []).map((value) => slugifyAscii(value, maxLength)).filter(Boolean));

  let slug = base;
  let collision = false;
  if (used.has(slug)) {
    collision = true;
    const datedBase = dateSlug && !base.endsWith(`-${dateSlug}`)
      ? withSuffix(base, dateSlug, maxLength)
      : base;
    slug = datedBase;
    let n = 2;
    while (used.has(slug)) {
      slug = withSuffix(datedBase, String(n), maxLength);
      n += 1;
    }
  }

  const preferredNormalized = slugifyAscii(preferredSlug, maxLength);
  return {
    slug,
    base,
    source: selected?.source || 'dateFallback',
    collision,
    repaired: slug !== preferredNormalized || !isMeaningfulSlug(preferredNormalized),
    preferredSlug: preferredNormalized
  };
}
