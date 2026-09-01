import http from 'node:http';
import { KOREAN_FIRST_SYSTEM_RULES, koreanLanguageIssues, koreanRepairInstruction } from './language.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_STRUCTURED_ATTEMPTS = 3;
const MAX_DEPTH_REPAIR_ROUNDS = 2;
const MAX_LANGUAGE_REPAIR_ROUNDS = 1;
const DRAFT_MIN_PARAGRAPH_CHARS = 3000;
const DRAFT_TARGET_PARAGRAPH_CHARS = 3800;
const QA_MIN_PARAGRAPH_CHARS = 3500;
const QA_TARGET_PARAGRAPH_CHARS = 4200;

const depthAdditionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    additions: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sectionIndex: { type: 'integer' },
          paragraphs: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } }
        },
        required: ['sectionIndex', 'paragraphs']
      }
    }
  },
  required: ['additions']
};

function assertShape(schema, value, path = '$') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected object at ${path}.`);
    for (const key of schema.required || []) if (!(key in value)) throw new Error(`Missing required field ${path}.${key}.`);
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) assertShape(child, value[key], `${path}.${key}`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`Expected array at ${path}.`);
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) throw new Error(`Too few items at ${path}.`);
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) throw new Error(`Too many items at ${path}.`);
    value.forEach((item, index) => assertShape(schema.items, item, `${path}[${index}]`));
  } else if (schema.type === 'string' && typeof value !== 'string') throw new Error(`Expected string at ${path}.`);
  else if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Expected boolean at ${path}.`);
  else if (schema.type === 'integer' && !Number.isInteger(value)) throw new Error(`Expected integer at ${path}.`);
}

const cleanBase = (baseUrl) => baseUrl.replace(/\/$/, '');

function paragraphChars(sections) {
  return (sections || []).flatMap((section) => section?.paragraphs || []).join('').length;
}

function articleDepthPolicy(schema) {
  const properties = schema?.properties || {};
  if (properties.revisedSections) {
    return {
      field: 'revisedSections',
      label: 'final QA article',
      minimum: QA_MIN_PARAGRAPH_CHARS,
      target: QA_TARGET_PARAGRAPH_CHARS,
      repairMaxOutputTokens: 4600,
      maxParagraphsPerSection: properties.revisedSections?.items?.properties?.paragraphs?.maxItems || 5
    };
  }
  if (properties.sections && properties.title && properties.slug) {
    return {
      field: 'sections',
      label: 'draft article',
      minimum: DRAFT_MIN_PARAGRAPH_CHARS,
      target: DRAFT_TARGET_PARAGRAPH_CHARS,
      repairMaxOutputTokens: 4200,
      maxParagraphsPerSection: properties.sections?.items?.properties?.paragraphs?.maxItems || 5
    };
  }
  return null;
}

function localHttpJson({ url, method = 'GET', body = null, timeoutMs = 30_000, maxBytes = 24 * 1024 * 1024 }) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) {
    throw new Error(`Refusing non-local Ollama transport target: ${target.origin}`);
  }
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    let settled = false;
    let deadline;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn(value);
    };
    const req = http.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      agent: false,
      headers: payload == null ? {} : {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let size = 0;
      const chunks = [];
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error(`Ollama response exceeded ${maxBytes} bytes.`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = {};
        if (text.trim()) {
          try { json = JSON.parse(text); }
          catch { return finish(reject, new Error(`Ollama returned invalid JSON (${res.statusCode}): ${text.slice(0, 500)}`)); }
        }
        finish(resolve, { status: res.statusCode || 0, json });
      });
      res.on('error', (error) => finish(reject, error));
    });
    req.on('error', (error) => finish(reject, error));
    deadline = setTimeout(() => {
      const error = new Error(`Ollama local request exceeded ${Math.round(timeoutMs / 1000)}s.`);
      error.code = 'OLLAMA_REQUEST_TIMEOUT';
      req.destroy(error);
    }, timeoutMs);
    if (payload != null) req.write(payload);
    req.end();
  });
}

async function ollamaHealthy(baseUrl) {
  try {
    const result = await localHttpJson({ url: `${cleanBase(baseUrl)}/api/tags`, timeoutMs: 5000 });
    return result.status >= 200 && result.status < 300;
  } catch {
    return false;
  }
}

function parseStructuredPayload(response, schema) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Ollama ${response.status}: ${JSON.stringify(response.json)}`);
  }
  const payload = response.json;
  const text = payload.message?.content;
  if (!text) throw new Error('Ollama response contained no message content.');
  const data = JSON.parse(text);
  assertShape(schema, data);
  return { data, payload, text };
}

function normalizedParagraph(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function mergeDepthAdditions(data, policy, additions) {
  const sections = (data[policy.field] || []).map((section) => ({
    ...section,
    paragraphs: [...(section.paragraphs || [])]
  }));
  const seen = new Set(sections.flatMap((section) => section.paragraphs || []).map(normalizedParagraph));
  let accepted = 0;
  let addedChars = 0;

  for (const addition of additions || []) {
    const index = addition.sectionIndex;
    if (!Number.isInteger(index) || index < 0 || index >= sections.length) continue;
    for (const paragraph of addition.paragraphs || []) {
      if (sections[index].paragraphs.length >= policy.maxParagraphsPerSection) break;
      const text = String(paragraph || '').trim();
      const normalized = normalizedParagraph(text);
      if (text.length < 120 || !normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      sections[index].paragraphs.push(text);
      accepted += 1;
      addedChars += text.length;
    }
  }

  return {
    data: { ...data, [policy.field]: sections },
    accepted,
    addedChars
  };
}

function depthRepairPrompt({ policy, data, originalInput, actualChars, round }) {
  const missing = Math.max(0, policy.target - actualChars);
  const compactSections = (data[policy.field] || []).map((section, sectionIndex) => ({
    sectionIndex,
    heading: section.heading,
    paragraphCount: (section.paragraphs || []).length,
    paragraphs: section.paragraphs || []
  }));
  return `This is append-only depth repair round ${round}. The existing ${policy.label} has ${actualChars} Korean paragraph characters; the hard minimum is ${policy.minimum} and the preferred target is ${policy.target}. Add roughly ${missing} useful characters across the existing sections without rewriting or deleting existing text. sectionIndex is zero-based and must reference an existing section. Each new paragraph should normally be 180-320 Korean characters and should add distinct reader value. Use only facts, conclusions, constraints, URLs, and evidence already present in the ORIGINAL INPUT below. You may deepen explanations, actionable steps, decision criteria, trade-offs, limitations, failure modes, and implications that are directly supported by that input. Do NOT invent facts, examples, prices, benchmarks, dates, URLs, personal experience, or fake precision. Do NOT repeat existing paragraphs or add SEO filler. Return additions only.\n\nORIGINAL INPUT:\n${originalInput}\n\nEXISTING SECTIONS:\n${JSON.stringify(compactSections)}`;
}

async function expandArticleDepth({ baseUrl, model, data, policy, originalInput, temperature, contextWindow, maxOutputTokens, timeoutMs }) {
  let current = data;
  let chars = paragraphChars(current[policy.field]);
  if (chars >= policy.minimum) return current;

  for (let round = 1; round <= MAX_DEPTH_REPAIR_ROUNDS; round += 1) {
    console.warn(`[quality] ${policy.label} depth=${chars} is below ${policy.minimum}; append-only repair ${round}/${MAX_DEPTH_REPAIR_ROUNDS}.`);
    const repairStarted = Date.now();
    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - repairStarted) / 1000);
      console.log(`[quality] ${policy.label} append-only repair still generating ... ${elapsed}s elapsed`);
    }, 60_000);
    heartbeat.unref?.();
    try {
      const repairBody = {
        model,
        stream: false,
        think: false,
        keep_alive: '30s',
        format: depthAdditionSchema,
        messages: [
          {
            role: 'system',
            content: `You are a conservative senior editor performing append-only depth repair. Preserve the existing article. Add only evidence-grounded Korean paragraphs that increase practical usefulness. ${KOREAN_FIRST_SYSTEM_RULES}\nReturn only JSON matching this schema exactly:\n${JSON.stringify(depthAdditionSchema)}`
          },
          {
            role: 'user',
            content: depthRepairPrompt({ policy, data: current, originalInput, actualChars: chars, round })
          }
        ],
        options: {
          temperature: Math.min(temperature, 0.15),
          num_ctx: contextWindow,
          num_predict: Math.max(maxOutputTokens, policy.repairMaxOutputTokens)
        }
      };
      const response = await localHttpJson({
        url: `${cleanBase(baseUrl)}/api/chat`,
        method: 'POST',
        body: repairBody,
        timeoutMs
      });
      const parsed = parseStructuredPayload(response, depthAdditionSchema);
      const merged = mergeDepthAdditions(current, policy, parsed.data.additions);
      current = merged.data;
      const nextChars = paragraphChars(current[policy.field]);
      console.log(`[quality] ${policy.label} append-only repair added ${merged.addedChars} chars in ${merged.accepted} paragraphs; total=${nextChars}.`);
      if (nextChars >= policy.minimum) return current;
      if (nextChars <= chars || merged.accepted === 0) {
        console.warn(`[quality] ${policy.label} append-only repair made no useful progress.`);
      }
      chars = nextChars;
    } finally {
      clearInterval(heartbeat);
    }
  }

  const error = new Error(`${policy.label} remained too thin after ${MAX_DEPTH_REPAIR_ROUNDS} append-only repairs (${chars} < ${policy.minimum} paragraph chars).`);
  error.code = 'ARTICLE_DEPTH_SHORT';
  throw error;
}

export async function ensureModel({ baseUrl, model }) {
  const base = cleanBase(baseUrl);
  const tags = await fetch(`${base}/api/tags`).then((r) => r.json()).catch(() => ({ models: [] }));
  if ((tags.models || []).some((m) => m.name === model || m.model === model)) return;
  console.log(`[model] pulling ${model} ...`);
  const response = await fetch(`${base}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  });
  if (!response.ok) throw new Error(`Failed to pull ${model}: ${response.status}`);
  if (!response.body) {
    console.log(`[model] ready ${model}`);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastPct = -10;
  let lastStatus = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.error) throw new Error(`Failed to pull ${model}: ${event.error}`);
      const status = String(event.status || '');
      if (event.total && event.completed) {
        const pct = Math.floor((event.completed / event.total) * 100);
        if (pct >= lastPct + 10) {
          lastPct = pct;
          console.log(`[model] ${model} download ${Math.min(100, pct)}%`);
        }
      } else if (status && status !== lastStatus) {
        lastStatus = status;
        console.log(`[model] ${model}: ${status}`);
      }
    }
  }
  console.log(`[model] ready ${model}`);
}

export async function removeModel({ baseUrl, model }) {
  try {
    await fetch(`${cleanBase(baseUrl)}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    console.log(`[model] removed ${model} from runner disk`);
  } catch (error) {
    console.warn(`[model] cleanup skipped for ${model}: ${error.message}`);
  }
}

export async function structuredResponse({
  baseUrl = 'http://127.0.0.1:11434',
  model,
  schema,
  instructions,
  input,
  temperature = 0.2,
  contextWindow = 16384,
  maxOutputTokens = 3500,
  timeoutMs = 900000
}) {
  const started = Date.now();
  const depthPolicy = articleDepthPolicy(schema);
  let languageRepairRounds = 0;
  const body = {
    model,
    stream: false,
    think: false,
    keep_alive: '30s',
    format: schema,
    messages: [
      { role: 'system', content: `${instructions}\n${KOREAN_FIRST_SYSTEM_RULES}\nReturn only data matching this JSON schema exactly:\n${JSON.stringify(schema)}` },
      { role: 'user', content: input }
    ],
    options: { temperature, num_ctx: contextWindow, num_predict: maxOutputTokens }
  };

  let lastError;
  for (let attempt = 1; attempt <= MAX_STRUCTURED_ATTEMPTS; attempt += 1) {
    const attemptStarted = Date.now();
    console.log(`[model] ${model} generating (attempt ${attempt}/${MAX_STRUCTURED_ATTEMPTS}, timeout ${Math.round(timeoutMs / 60_000)}m) ...`);
    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - attemptStarted) / 1000);
      console.log(`[model] ${model} still generating ... ${elapsed}s elapsed`);
    }, 60_000);
    heartbeat.unref?.();
    try {
      const response = await localHttpJson({
        url: `${cleanBase(baseUrl)}/api/chat`,
        method: 'POST',
        body,
        timeoutMs
      });
      const parsed = parseStructuredPayload(response, schema);
      let data = parsed.data;

      const languageIssues = koreanLanguageIssues(schema, data);
      if (languageIssues.length) {
        console.warn(`[language] Korean-first policy failed: ${languageIssues.join(' | ')}`);
        if (languageRepairRounds >= MAX_LANGUAGE_REPAIR_ROUNDS) {
          const error = new Error(`Korean-first language policy still failed after automatic repair: ${languageIssues.join(' | ')}`);
          error.code = 'KOREAN_LANGUAGE_POLICY';
          throw error;
        }
        languageRepairRounds += 1;
        console.warn(`[language] requesting automatic Korean-first repair ${languageRepairRounds}/${MAX_LANGUAGE_REPAIR_ROUNDS} before publication.`);
        body.messages.push(
          { role: 'assistant', content: parsed.text },
          { role: 'user', content: koreanRepairInstruction(languageIssues) }
        );
        body.options.temperature = Math.min(body.options.temperature, 0.1);
        continue;
      }

      if (depthPolicy) {
        const initialChars = paragraphChars(data[depthPolicy.field]);
        console.log(`[quality] ${depthPolicy.label} depth=${initialChars} paragraph chars (minimum ${depthPolicy.minimum})`);
        if (initialChars < depthPolicy.minimum) {
          data = await expandArticleDepth({
            baseUrl,
            model,
            data,
            policy: depthPolicy,
            originalInput: input,
            temperature,
            contextWindow,
            maxOutputTokens,
            timeoutMs
          });
          assertShape(schema, data);
          console.log(`[quality] ${depthPolicy.label} repaired depth=${paragraphChars(data[depthPolicy.field])} paragraph chars.`);
        }
      }

      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`[model] ${model} completed in ${seconds}s (${parsed.payload.eval_count || '?'} primary output tokens)`);
      return {
        data,
        metrics: {
          totalDuration: parsed.payload.total_duration || null,
          evalCount: parsed.payload.eval_count || null,
          wallSeconds: seconds
        }
      };
    } catch (error) {
      lastError = error;
      const elapsed = Math.round((Date.now() - attemptStarted) / 1000);
      console.warn(`[model] ${model} attempt ${attempt} failed after ${elapsed}s: ${error.code || error.name || 'Error'} ${error.message}`);
      if (error.code === 'OLLAMA_REQUEST_TIMEOUT' || error.code === 'ARTICLE_DEPTH_SHORT' || error.code === 'KOREAN_LANGUAGE_POLICY' || attempt === MAX_STRUCTURED_ATTEMPTS) break;
      const healthy = await ollamaHealthy(baseUrl);
      console.warn(`[model] Ollama health before retry: ${healthy ? 'ok' : 'unavailable'}`);
      if (!healthy) throw error;
      await sleep(2000);
    } finally {
      clearInterval(heartbeat);
    }
  }
  throw lastError;
}
