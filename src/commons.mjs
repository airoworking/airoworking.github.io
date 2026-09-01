import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'ProfitableBlogAutomation/1.1 (+https://github.com/airoworking/airoworking.github.io)';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value = '') {
  return decodeHtml(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function metaValue(extmetadata, key) {
  return stripHtml(extmetadata?.[key]?.value || '');
}

function safeCommonsUrl(value, hosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Wikimedia Commons API ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function isReusableCommonsLicense(name, allowedFamilies = []) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  const lower = clean.toLowerCase();
  if (/\b(?:nc|nd)\b/.test(lower) || lower.includes('noncommercial') || lower.includes('no derivatives')) return false;
  return allowedFamilies.some((family) => {
    const f = String(family).toLowerCase();
    if (f === 'public domain') return lower.includes('public domain');
    if (f === 'cc0') return lower.startsWith('cc0');
    if (f === 'cc by-sa') return /^cc by-sa(?:\s|$)/i.test(clean);
    if (f === 'cc by') return /^cc by(?:\s|$)/i.test(clean) && !/^cc by-sa(?:\s|$)/i.test(clean);
    return lower === f;
  });
}

function looksLikePhoto(page, info) {
  if (!info?.thumburl || !info?.url) return false;
  if (String(info.mediatype || '').toUpperCase() !== 'BITMAP') return false;
  const mime = String(info.mime || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return false;
  if ((info.width || 0) < 800 || (info.height || 0) < 450) return false;
  const title = String(page.title || '').toLowerCase();
  if (/\b(logo|icon|diagram|chart|screenshot|map|flag|seal|symbol|poster|drawing|illustration|vector)\b/.test(title)) return false;
  return true;
}

function queryTokens(value) {
  return new Set(String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter((x) => x.length > 2));
}

function relevanceScore(query, candidate) {
  const querySet = queryTokens(query);
  const textSet = queryTokens(`${candidate.title} ${candidate.description}`);
  let overlap = 0;
  for (const token of querySet) if (textSet.has(token)) overlap += 1;
  const ratio = candidate.width / Math.max(candidate.height, 1);
  const licenseBonus = /public domain|cc0/i.test(candidate.license) ? 15 : /cc by(?!-sa)/i.test(candidate.license) ? 10 : 6;
  const dimensionBonus = candidate.width >= 1600 ? 10 : 4;
  const landscapeBonus = ratio >= 1.2 && ratio <= 2.2 ? 8 : 0;
  return overlap * 14 + licenseBonus + dimensionBonus + landscapeBonus;
}

function normalizeCandidate(page, options) {
  const info = page.imageinfo?.[0];
  if (!looksLikePhoto(page, info)) return null;
  const ext = info.extmetadata || {};
  const license = metaValue(ext, 'LicenseShortName') || metaValue(ext, 'UsageTerms');
  if (!isReusableCommonsLicense(license, options.allowedLicenseFamilies)) return null;
  const restrictions = metaValue(ext, 'Restrictions');
  if (restrictions && !/^none$/i.test(restrictions)) return null;
  const author = (metaValue(ext, 'Artist') || metaValue(ext, 'Credit')).slice(0, 500);
  const attributionRequired = /true|yes|1/i.test(metaValue(ext, 'AttributionRequired'));
  if (!author) return null;
  const sourcePageUrl = safeCommonsUrl(info.descriptionurl, ['commons.wikimedia.org']);
  const originalFileUrl = safeCommonsUrl(info.url, ['upload.wikimedia.org']);
  const thumbUrl = safeCommonsUrl(info.thumburl, ['upload.wikimedia.org']);
  if (!sourcePageUrl || !originalFileUrl || !thumbUrl) return null;
  const licenseUrl = safeCommonsUrl(info.extmetadata?.LicenseUrl?.value || '', [
    'creativecommons.org',
    'www.gnu.org',
    'commons.wikimedia.org'
  ]);
  if (!licenseUrl && !/public domain/i.test(license)) return null;
  return {
    provider: 'Wikimedia Commons',
    title: String(page.title || '').replace(/^File:/, ''),
    description: metaValue(ext, 'ImageDescription').slice(0, 700),
    author,
    license,
    licenseUrl,
    attributionRequired,
    sourcePageUrl,
    originalFileUrl,
    thumbUrl,
    mime: info.thumbmime || info.mime || '',
    originalMime: info.mime || '',
    width: info.width || null,
    height: info.height || null
  };
}

export async function searchLicensedCommonsPhotos(query, options = {}) {
  const searchQuery = String(query || '').trim();
  if (!searchQuery) return [];
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: searchQuery,
    gsrnamespace: '6',
    gsrlimit: String(options.maxSearchResults || 8),
    prop: 'imageinfo',
    iilimit: '1',
    iiprop: 'url|size|mime|mediatype|extmetadata|thumbmime',
    iiurlwidth: String(options.thumbWidth || 1200),
    iiextmetadatalanguage: 'en',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|UsageTerms|Artist|Credit|AttributionRequired|ImageDescription|Restrictions'
  });
  const payload = await fetchJson(`${API}?${params}`, options.requestTimeoutMs || 20000);
  return (payload.query?.pages || [])
    .map((page) => normalizeCandidate(page, options))
    .filter(Boolean)
    .map((candidate) => ({ ...candidate, relevanceScore: relevanceScore(searchQuery, candidate) }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function extensionForMime(mime) {
  const clean = String(mime || '').split(';')[0].trim().toLowerCase();
  if (clean === 'image/png') return 'png';
  if (clean === 'image/webp') return 'webp';
  return 'jpg';
}

async function downloadPhoto(photo, outputDir, slug, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.requestTimeoutMs || 20000);
  try {
    const response = await fetch(photo.thumbUrl, { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Wikimedia image download ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) throw new Error(`Unsupported Wikimedia image type: ${contentType}`);
    const declared = Number(response.headers.get('content-length') || 0);
    const maxBytes = options.maxBytes || 3500000;
    if (declared && declared > maxBytes) throw new Error(`Wikimedia thumbnail exceeds ${maxBytes} bytes.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`Wikimedia thumbnail exceeds ${maxBytes} bytes.`);
    const ext = extensionForMime(contentType);
    const filename = `${slug}-commons.${ext}`;
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, filename), bytes);
    return {
      ...photo,
      mime: contentType,
      localPath: `assets/posts/${filename}`,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      retrievedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLicensedCommonsPhoto({ query, slug, root, options = {} }) {
  if (!options.enabled || !query) return null;
  try {
    const candidates = await searchLicensedCommonsPhotos(query, options);
    if (!candidates.length) {
      console.log(`[commons] no reusable photo found for: ${query}`);
      return null;
    }
    for (const candidate of candidates) {
      try {
        const saved = await downloadPhoto(candidate, path.join(root, 'public', 'assets', 'posts'), slug, options);
        console.log(`[commons] saved ${saved.title} · ${saved.license} · ${saved.author}`);
        return saved;
      } catch (error) {
        console.warn(`[commons] candidate skipped: ${error.message}`);
      }
    }
  } catch (error) {
    console.warn(`[commons] photo lookup skipped: ${error.message}`);
  }
  return null;
}
