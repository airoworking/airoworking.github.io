import net from 'node:net';

const UA = 'ProfitableBlogAutomation/3.0 (+https://github.com/airoworking/airoworking.github.io)';

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

function stripHtml(html = '') {
  return decodeHtml(String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function isPrivateIpv4(ip) {
  const p = ip.split('.').map(Number);
  return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] === 0;
}

export function safePublicUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return '';
    if (net.isIP(host) === 4 && isPrivateIpv4(host)) return '';
    if (net.isIP(host) === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function canonicalUrl(value) {
  const safe = safePublicUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  url.hash = '';
  url.searchParams.sort();
  const text = url.toString();
  return text.endsWith('/') ? text.slice(0, -1) : text;
}

async function fetchWithTimeout(url, { timeoutMs = 15000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function ddgTarget(raw) {
  try {
    const url = new URL(decodeHtml(raw), 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return safePublicUrl(uddg ? decodeURIComponent(uddg) : url.toString());
  } catch {
    return '';
  }
}

async function searchDuckDuckGo(query, limit, timeoutMs) {
  const response = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    timeoutMs,
    headers: { Accept: 'text/html,application/xhtml+xml' }
  });
  if (!response.ok) throw new Error(`DuckDuckGo search ${response.status}`);
  const html = await response.text();
  const results = [];
  const re = /<a\b([^>]*class=["'][^"']*result__a[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const href = match[1].match(/href=["']([^"']+)["']/i)?.[1] || '';
    const url = ddgTarget(href);
    if (!url) continue;
    results.push({ title: stripHtml(match[2]), url, snippet: '', provider: 'duckduckgo', query });
    if (results.length >= limit) break;
  }
  return results;
}

async function searchGitHub(query, limit, timeoutMs) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetchWithTimeout(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`, { timeoutMs, headers });
  if (!response.ok) throw new Error(`GitHub search ${response.status}`);
  const payload = await response.json();
  return (payload.items || []).slice(0, limit).map((item) => ({
    title: item.full_name,
    url: safePublicUrl(item.html_url),
    snippet: item.description || '',
    provider: 'github',
    query,
    popularity: item.stargazers_count || 0,
    updatedAt: item.pushed_at || item.updated_at || ''
  })).filter((x) => x.url);
}

async function searchHackerNews(query, limit, timeoutMs) {
  const response = await fetchWithTimeout(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`, {
    timeoutMs,
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Hacker News search ${response.status}`);
  const payload = await response.json();
  return (payload.hits || []).slice(0, limit).map((hit) => ({
    title: hit.title || 'Hacker News discussion',
    url: safePublicUrl(hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`),
    snippet: hit.story_text || '',
    provider: 'hackernews',
    query,
    popularity: hit.points || 0,
    updatedAt: hit.created_at || ''
  })).filter((x) => x.url);
}

async function pageDocument(candidate, maxChars, timeoutMs) {
  try {
    const response = await fetchWithTimeout(candidate.url, {
      timeoutMs,
      headers: { Accept: 'text/html,text/plain,application/json;q=0.8' }
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!/(text|html|json|xml)/i.test(type)) return null;
    const raw = (await response.text()).slice(0, 250000);
    const title = stripHtml(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || candidate.title).slice(0, 240);
    const text = stripHtml(raw).slice(0, maxChars);
    if (text.length < 180) {
      return candidate.snippet ? { ...candidate, title: title || candidate.title, text: candidate.snippet.slice(0, maxChars) } : null;
    }
    return { ...candidate, title: title || candidate.title, text };
  } catch {
    return candidate.snippet ? { ...candidate, text: candidate.snippet.slice(0, maxChars) } : null;
  }
}

function dayIndex(dateText) {
  const t = Date.parse(`${dateText}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 86400000) : 0;
}

function segmentProblem(segment, index, globalProblems) {
  const needs = Array.isArray(segment?.needs) && segment.needs.length ? segment.needs : globalProblems;
  if (!needs.length) return '';
  return needs[index % needs.length];
}

export function buildDiscoveryQueries(config, dateText) {
  const pillars = config.topicPillars || [];
  const segments = config.audienceSegments || [];
  const problems = config.problemAreas || [];
  const templates = config.intentTemplates || ['{pillar}'];
  const segmentTemplates = templates.filter((template) => template.includes('{segment}'));
  const count = Math.max(1, config.discoveryQueryCount || 10);
  const offset = dayIndex(dateText);
  const out = [];
  if (!pillars.length || !templates.length) return out;

  // Guarantee broad-market coverage first: every configured audience segment gets
  // at least one explicit discovery query before intent/template rotation continues.
  for (let i = 0; i < Math.min(segments.length, count); i += 1) {
    const segment = segments[(offset + i) % segments.length];
    const pillar = pillars[(offset * 3 + i * 5) % pillars.length];
    const problem = segmentProblem(segment, offset + i * 2, problems) || pillar;
    const template = segmentTemplates[(offset + i) % Math.max(segmentTemplates.length, 1)] || '{problem} AI automation for {segment}';
    const q = String(template)
      .replaceAll('{pillar}', pillar)
      .replaceAll('{segment}', segment.searchPhrase || segment.label)
      .replaceAll('{problem}', problem)
      .replace(/\s+/g, ' ')
      .trim();
    if (q && !out.includes(q)) out.push(q);
  }

  for (let i = 0; i < count * 6 && out.length < count; i += 1) {
    const segment = segments.length ? segments[(offset + i * 2) % segments.length] : null;
    const pillar = pillars[(offset * 3 + i * 5) % pillars.length];
    const problem = segmentProblem(segment, offset + i * 3, problems) || problems[(offset + i * 3) % Math.max(problems.length, 1)] || pillar;
    const template = templates[(offset * 7 + i * 5) % templates.length];
    const q = String(template)
      .replaceAll('{pillar}', pillar)
      .replaceAll('{segment}', segment?.searchPhrase || segment?.label || 'people at work')
      .replaceAll('{problem}', problem)
      .replace(/\s+/g, ' ')
      .trim();
    if (q && !out.includes(q)) out.push(q);
  }
  return out;
}

function isTechnicalQuery(query) {
  return /developer|coding|github|open source|local llm|ollama|rag|self.?host|api|docker|kubernetes|agent framework|infrastructure|workflow orchestration/i.test(query);
}

function isTechProductQuery(query) {
  return /\b(ai|automation|tool|software|saas|agent|llm|workflow|productivity|chatgpt|claude|notion|zapier|make|n8n)\b/i.test(query);
}

async function searchQueryFamily(query, per, timeoutMs) {
  const searches = [searchDuckDuckGo(query, per, timeoutMs)];
  if (isTechnicalQuery(query)) searches.push(searchGitHub(query, Math.min(3, per), timeoutMs));
  if (isTechProductQuery(query)) searches.push(searchHackerNews(query, Math.min(3, per), timeoutMs));
  const groups = await Promise.allSettled(searches);
  return groups.flatMap((g) => g.status === 'fulfilled' ? g.value : []);
}

export async function collectEvidence(queries, options = {}) {
  const unique = [...new Set((queries || []).map((q) => String(q).trim()).filter(Boolean))].slice(0, options.maxQueries || 10);
  const per = options.maxSearchResultsPerQuery || 5;
  const timeoutMs = options.requestTimeoutMs || 15000;
  console.log(`[research] searching ${unique.length} query families`);

  const queryGroups = await Promise.all(unique.map((query) => searchQueryFamily(query, per, timeoutMs)));
  const candidates = queryGroups.flat();
  const seen = new Set();
  const deduped = [];
  for (const item of candidates) {
    const key = canonicalUrl(item.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...item, url: safePublicUrl(item.url) });
  }

  const maxDocuments = options.maxDocuments || 10;
  const fetched = await Promise.allSettled(deduped.slice(0, maxDocuments * 2).map((candidate) =>
    pageDocument(candidate, options.maxCharsPerDocument || 2600, timeoutMs)));
  const docs = fetched
    .filter((x) => x.status === 'fulfilled' && x.value?.url && (x.value.text || x.value.snippet))
    .map((x) => x.value)
    .slice(0, maxDocuments);
  console.log(`[research] ${candidates.length} candidates -> ${docs.length} usable documents`);
  return docs;
}

export function evidenceForPrompt(documents) {
  return documents.map((doc, index) =>
    `[S${index + 1}] ${doc.title}\nURL: ${doc.url}\nProvider: ${doc.provider}\nDiscovery query: ${doc.query}\nPopularity signal: ${doc.popularity || 0}\nUpdated: ${doc.updatedAt || 'unknown'}\nEvidence: ${(doc.text || doc.snippet || '').slice(0, 2600)}`
  ).join('\n\n');
}

export function allowedSourceMap(documents) {
  const map = new Map();
  for (const doc of documents) map.set(canonicalUrl(doc.url), { title: doc.title, url: safePublicUrl(doc.url) });
  return map;
}
