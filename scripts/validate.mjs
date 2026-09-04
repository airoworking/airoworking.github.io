import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('config/blog.config.json', 'utf8'));
const posts = JSON.parse(await readFile('data/posts.json', 'utf8'));
const queue = JSON.parse(await readFile('data/topic-queue.json', 'utf8'));

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function nearOne(values) {
  return Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 0.001;
}

if (!config.site?.baseUrl?.startsWith('https://')) throw new Error('config.site.baseUrl must use HTTPS.');
if (!config.site?.name?.includes('AI')) throw new Error('site.name must preserve the Practical AI identity.');
if (config.localModel?.provider !== 'ollama') throw new Error('config.localModel.provider must be ollama.');
if (!String(config.localModel?.baseUrl || '').startsWith('http://127.0.0.1:')) throw new Error('config.localModel.baseUrl must point to local loopback Ollama.');

const requiredStages = ['topic', 'research', 'draft', 'qa'];
const stageModels = requiredStages.map((name) => {
  const stage = config.localModel?.stages?.[name];
  if (!stage?.model) throw new Error(`localModel.stages.${name}.model is required.`);
  if (String(stage.model).includes('cloud')) throw new Error(`Cloud Ollama model is forbidden in zero-cost mode: ${stage.model}`);
  if (!Number.isInteger(stage.contextWindow) || stage.contextWindow < 2048) throw new Error(`${name}.contextWindow is invalid.`);
  if (!Number.isInteger(stage.maxOutputTokens) || stage.maxOutputTokens < 256) throw new Error(`${name}.maxOutputTokens is invalid.`);
  if (!Number.isInteger(stage.timeoutMs) || stage.timeoutMs < 60_000) throw new Error(`${name}.timeoutMs is invalid.`);
  return stage.model;
});
const uniqueStageModels = new Set(stageModels);
if (uniqueStageModels.size < stageModels.length) {
  console.log(`[validate] model reuse enabled for zero-cost runner reliability: ${stageModels.join(' -> ')}`);
}

if (!Number.isInteger(config.content?.minimumQualityScore) || config.content.minimumQualityScore < 80 || config.content.minimumQualityScore > 100) {
  throw new Error('minimumQualityScore must be an integer from 80 to 100.');
}

const segments = config.research?.audienceSegments;
if (!Array.isArray(segments) || segments.length < 5) throw new Error('research.audienceSegments must contain at least five segments.');
const segmentIds = segments.map((segment) => segment.id);
if (new Set(segmentIds).size !== segmentIds.length || segmentIds.some((id) => !id)) throw new Error('research.audienceSegments IDs must be unique and non-empty.');
for (const segment of segments) {
  if (!segment.label || !segment.searchPhrase) throw new Error(`Audience segment ${segment.id} needs label and searchPhrase.`);
  if (!Array.isArray(segment.needs) || segment.needs.length < 3) throw new Error(`Audience segment ${segment.id} needs at least three problem areas.`);
}
if (!Array.isArray(config.research?.problemAreas) || config.research.problemAreas.length < 10) throw new Error('research.problemAreas must contain at least 10 broad work/business problems.');
if (!Array.isArray(config.research?.topicPillars) || config.research.topicPillars.length < 12) throw new Error('research.topicPillars must contain at least 12 pillars.');
if (!Array.isArray(config.research?.intentTemplates) || config.research.intentTemplates.length < 10) throw new Error('research.intentTemplates must contain at least 10 templates.');
if (!config.research.intentTemplates.some((template) => template.includes('{segment}'))) throw new Error('At least one intent template must vary by audience segment.');
if (!config.research.intentTemplates.some((template) => template.includes('{problem}'))) throw new Error('At least one intent template must vary by reader problem.');
if (!Number.isInteger(config.research.discoveryQueryCount) || config.research.discoveryQueryCount < 8) throw new Error('discoveryQueryCount must be at least 8.');

const portfolio = config.content?.portfolio;
if (!portfolio || !Number.isInteger(portfolio.balanceWindow) || portfolio.balanceWindow < 10) throw new Error('content.portfolio.balanceWindow must be at least 10.');
const audienceTargets = portfolio.audienceTargets || {};
if (!nearOne(Object.values(audienceTargets))) throw new Error('content.portfolio.audienceTargets must sum to 1.');
if (Object.keys(audienceTargets).some((id) => !segmentIds.includes(id))) throw new Error('Audience target contains an unknown segment ID.');
if ((audienceTargets.developer || 0) > 0.30) throw new Error('Developer target must stay <= 30% to preserve the broadened audience strategy.');
const roleTargets = portfolio.contentRoleTargets || {};
if (!nearOne(Object.values(roleTargets))) throw new Error('content.portfolio.contentRoleTargets must sum to 1.');
for (const role of ['reach', 'commercial', 'authority']) if (typeof roleTargets[role] !== 'number') throw new Error(`Missing content role target: ${role}.`);

const adPolicy = config.monetization?.adsensePolicy;
if (!adPolicy) throw new Error('monetization.adsensePolicy is required.');
for (const key of ['reachPlacements', 'commercialPlacements', 'authorityPlacements']) {
  if (!Number.isInteger(adPolicy[key]) || adPolicy[key] < 0 || adPolicy[key] > 3) throw new Error(`${key} must be an integer from 0 to 3.`);
}
if (adPolicy.reachPlacements < adPolicy.commercialPlacements) throw new Error('Reach pages should not have fewer ads than commercial pages.');

if (!config.publishing?.timezone) throw new Error('config.publishing.timezone is required.');
if (config.visuals?.commonsPhotos?.enabled) {
  const commons = config.visuals.commonsPhotos;
  if (!Array.isArray(commons.allowedLicenseFamilies) || commons.allowedLicenseFamilies.length < 2) throw new Error('visuals.commonsPhotos.allowedLicenseFamilies must define reusable license families.');
  const forbidden = commons.allowedLicenseFamilies.some((license) => /\bNC\b|\bND\b|noncommercial|no derivatives/i.test(String(license)));
  if (forbidden) throw new Error('Non-commercial or no-derivatives Commons licenses are forbidden for this monetized blog.');
  if (!Number.isInteger(commons.thumbWidth) || commons.thumbWidth < 800 || commons.thumbWidth > 2000) throw new Error('visuals.commonsPhotos.thumbWidth must be 800-2000.');
  if (!Number.isInteger(commons.maxBytes) || commons.maxBytes < 500000 || commons.maxBytes > 8000000) throw new Error('visuals.commonsPhotos.maxBytes is invalid.');
}
if (!Array.isArray(posts)) throw new Error('data/posts.json must contain an array.');
if (!Array.isArray(queue)) throw new Error('data/topic-queue.json must contain an array.');

const slugs = new Set();
const titles = new Set();
const keywords = new Set();
for (const post of posts) {
  if (!post.slug || slugs.has(post.slug)) throw new Error(`Invalid/duplicate post slug: ${post.slug}`);
  slugs.add(post.slug);
  const title = String(post.title || '').trim().toLowerCase();
  if (!title || titles.has(title)) throw new Error(`Invalid/duplicate post title: ${post.title}`);
  titles.add(title);
  const keyword = String(post.primaryKeyword || '').trim().toLowerCase();
  if (!keyword || keywords.has(keyword)) throw new Error(`Invalid/duplicate primary keyword: ${post.primaryKeyword}`);
  keywords.add(keyword);
  const urls = new Set((post.sources || []).filter((source) => validHttpUrl(source.url)).map((source) => source.url));
  if (urls.size < 3) throw new Error(`Post ${post.slug} must contain at least 3 unique valid source URLs.`);
  if (post.audienceSegment && post.audienceSegment !== 'general' && !segmentIds.includes(post.audienceSegment)) throw new Error(`Unknown audience segment for ${post.slug}: ${post.audienceSegment}`);
  if (post.contentRole && !['reach', 'commercial', 'authority'].includes(post.contentRole)) throw new Error(`Unknown content role for ${post.slug}: ${post.contentRole}`);
  if (post.media) {
    if (post.media.provider !== 'Wikimedia Commons') throw new Error(`Unsupported media provider for ${post.slug}.`);
    if (!String(post.media.localPath || '').startsWith('assets/posts/')) throw new Error(`Invalid local media path for ${post.slug}.`);
    if (!validHttpUrl(post.media.sourcePageUrl)) throw new Error(`Invalid media source page for ${post.slug}.`);
    if (!post.media.license || !post.media.author) throw new Error(`Missing media attribution for ${post.slug}.`);
  }
}

console.log(`Configuration valid: ${stageModels.join(' -> ')}; ${segments.length} audience segments; portfolio balancing + role-aware AdSense enabled; ${posts.length} posts, ${queue.length} queued topics.`);
