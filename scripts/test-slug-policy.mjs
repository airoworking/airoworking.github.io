import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isMeaningfulSlug, resolveArticleSlug, slugifyAscii } from '../src/slug-policy.mjs';

assert.equal(slugifyAscii('  AI / Content Automation  '), 'ai-content-automation');
assert.equal(isMeaningfulSlug('ai'), false);
assert.equal(isMeaningfulSlug('crm'), false);
assert.equal(isMeaningfulSlug('content-automation'), true);

const currentFailure = resolveArticleSlug({
  primaryKeyword: 'content automation',
  preferredSlug: 'ai',
  title: 'AI 콘텐츠 자동화 도구의 기능 및 활용 사례',
  topic: 'AI 콘텐츠 자동화 도구의 기능 및 활용 사례',
  date: '2026-09-07',
  existingSlugs: ['ai', 'crm']
});
assert.equal(currentFailure.slug, 'content-automation');
assert.equal(currentFailure.source, 'primaryKeyword');
assert.equal(currentFailure.collision, false);
assert.equal(currentFailure.repaired, true);

const firstCollision = resolveArticleSlug({
  primaryKeyword: 'content automation',
  preferredSlug: 'content-automation',
  date: '2026-09-07',
  existingSlugs: ['content-automation']
});
assert.equal(firstCollision.slug, 'content-automation-2026-09-07');
assert.equal(firstCollision.collision, true);

const repeatedCollision = resolveArticleSlug({
  primaryKeyword: 'content automation',
  preferredSlug: 'content-automation',
  date: '2026-09-07',
  existingSlugs: ['content-automation', 'content-automation-2026-09-07', 'content-automation-2026-09-07-2']
});
assert.equal(repeatedCollision.slug, 'content-automation-2026-09-07-3');

const koreanOnly = resolveArticleSlug({
  primaryKeyword: '업무 자동화',
  preferredSlug: 'ai',
  title: '업무 자동화 가이드',
  topic: '반복 업무 자동화',
  date: '2026-09-07',
  existingSlugs: ['ai']
});
assert.equal(koreanOnly.slug, 'article-2026-09-07');
assert.equal(koreanOnly.source, 'dateFallback');

const fallbackCollision = resolveArticleSlug({
  primaryKeyword: '업무 자동화',
  preferredSlug: '',
  title: '업무 자동화 가이드',
  topic: '반복 업무 자동화',
  date: '2026-09-07',
  existingSlugs: ['article-2026-09-07', 'article-2026-09-07-2']
});
assert.equal(fallbackCollision.slug, 'article-2026-09-07-3');

const sanitized = resolveArticleSlug({
  primaryKeyword: '../../etc/passwd',
  preferredSlug: '../ai',
  date: '2026-09-07',
  existingSlugs: []
});
assert.equal(sanitized.slug, 'etc-passwd');
assert.equal(sanitized.slug.includes('..'), false);
assert.equal(sanitized.slug.includes('/'), false);

const long = resolveArticleSlug({
  primaryKeyword: 'a'.repeat(100),
  preferredSlug: '',
  date: '2026-09-07',
  existingSlugs: ['a'.repeat(80)]
});
assert.equal(long.slug.length <= 80, true);
assert.equal(long.slug.endsWith('2026-09-07'), true);

const pipeline = await readFile(new URL('../src/pipeline.mjs', import.meta.url), 'utf8');
const draftIndex = pipeline.indexOf('const article = await writeArticle');
const slugIndex = pipeline.indexOf('const slugDecision = resolveArticleSlug');
const qaIndex = pipeline.indexOf('const qa = await qualityCheck');
assert.ok(draftIndex >= 0 && slugIndex > draftIndex && qaIndex > slugIndex, 'slug must be reserved after draft and before expensive QA');
assert.equal(pipeline.includes('throw new Error(`Duplicate slug:'), false, 'duplicate slug must not remain a fatal terminal error');
assert.match(pipeline, /collectExistingArtifactSlugs/);
assert.match(pipeline, /public\/posts/);
assert.match(pipeline, /data\/articles/);
assert.match(pipeline, /data\/media/);
assert.match(pipeline, /public\/assets\/posts/);

console.log('slug policy tests passed');
