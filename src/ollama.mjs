import {
  ensureModel,
  removeModel,
  structuredResponse as baseStructuredResponse
} from './ollama-base.mjs';
import { koreanLanguageIssues } from './language.mjs';

export { ensureModel, removeModel };

const DRAFT_HANDOFF_WARN_PARAGRAPH_CHARS = 1000;
const DRAFT_HANDOFF_TARGET_PARAGRAPH_CHARS = 2200;
const QA_MIN_PARAGRAPH_CHARS = 3500;
const QA_PRIMARY_TARGET_PARAGRAPH_CHARS = 3800;
const QA_EXPANSION_TIMEOUT_MS = 600000;

const HUMAN_EDITORIAL_RULES = `Editorial voice rules: Write like an experienced Korean editor explaining a real work problem to a colleague. Avoid formulaic AI prose, inflated claims, repetitive summaries, and mechanically enumerated sections. Vary sentence and paragraph length naturally. Use bullets only when scanning genuinely helps; otherwise prefer connected prose. Do not start every section with a definition or end every section with a generic conclusion. Avoid repetitive endings such as '~하는 것이 중요합니다' and empty phrases such as '효율성을 높이고 비용을 절감하며 성과를 향상시킵니다'. Prefer concrete situations, trade-offs, and transitions. Titles and headings must sound like natural Korean editorial copy, not keyword-stuffed templates: avoid phrases such as '실전 활용 가이드', '완벽 가이드', '효율적인 도입 전략 및 단계별 실행' unless absolutely necessary. Never put Markdown syntax such as **bold**, __bold__, backticks, or Markdown list markers inside JSON string fields. For a sequential process, a short ordered list is fine, but do not turn the entire article into '1단계/2단계/3단계' prose. Do not pretend to have personal experience.`;

function paragraphChars(sections) {
  return (sections || []).flatMap((section) => section?.paragraphs || []).join('').length;
}

function isDraftSchema(schema) {
  const properties = schema?.properties || {};
  return Boolean(properties.sections && properties.title && properties.slug && !properties.revisedSections);
}

function isQaSchema(schema) {
  const properties = schema?.properties || {};
  return Boolean(properties.revisedSections && properties.revisedTitle && properties.revisedDescription);
}

function draftHandoffSchema(schema) {
  const properties = { ...(schema?.properties || {}) };
  delete properties.slug;
  return {
    ...schema,
    properties,
    required: (schema?.required || []).filter((field) => field !== 'slug')
  };
}

function qaNoLegacyDepthSchema(schema) {
  const properties = { ...(schema?.properties || {}) };
  properties.sections = properties.revisedSections;
  delete properties.revisedSections;
  return {
    ...schema,
    properties,
    required: (schema?.required || []).map((field) => field === 'revisedSections' ? 'sections' : field)
  };
}

function sectionsOnlySchema(schema) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: { sections: schema.properties.revisedSections },
    required: ['sections']
  };
}

function normalizeForDedupe(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function mergeParagraphText(section, value) {
  const text = String(value || '').trim();
  const normalized = normalizeForDedupe(text);
  if (!normalized) return false;

  for (let index = 0; index < section.paragraphs.length; index += 1) {
    const existing = normalizeForDedupe(section.paragraphs[index]);
    if (!existing) continue;
    if (existing === normalized || existing.includes(normalized)) return false;
    if (normalized.includes(existing) && normalized.length > existing.length + 20) {
      section.paragraphs[index] = text;
      return true;
    }
  }

  if (section.paragraphs.length < 5) {
    section.paragraphs.push(text);
    return true;
  }

  // The schema caps each section at five paragraphs. A complete expansion used to be
  // silently discarded whenever the primary QA already occupied all five slots.
  // Keep the expansion by folding new, non-duplicate prose into the shortest existing
  // paragraph instead of dropping it. This preserves every model-written fact-checked
  // sentence without breaking the schema or making another LLM call.
  let shortestIndex = 0;
  for (let index = 1; index < section.paragraphs.length; index += 1) {
    if (String(section.paragraphs[index] || '').length < String(section.paragraphs[shortestIndex] || '').length) {
      shortestIndex = index;
    }
  }
  const current = String(section.paragraphs[shortestIndex] || '').trim();
  section.paragraphs[shortestIndex] = current ? `${current} ${text}` : text;
  return true;
}

function promoteUsefulBulletsToParagraphs(sections, minimum = QA_MIN_PARAGRAPH_CHARS) {
  const next = (sections || []).map((section) => ({
    ...section,
    paragraphs: [...(section.paragraphs || [])],
    bullets: [...(section.bullets || [])]
  }));
  let chars = paragraphChars(next);
  if (chars >= minimum) return next;

  for (const section of next) {
    const kept = [];
    for (const bullet of section.bullets) {
      const text = String(bullet || '').trim();
      if (chars < minimum && text.length >= 80 && mergeParagraphText(section, text)) {
        chars = paragraphChars(next);
      } else {
        kept.push(text);
      }
    }
    section.bullets = kept;
    if (chars >= minimum) break;
  }
  return next;
}

function mergeExpandedSections(current, expanded) {
  const merged = (current || []).map((section) => ({
    ...section,
    paragraphs: [...(section.paragraphs || [])],
    bullets: [...(section.bullets || [])]
  }));

  for (let index = 0; index < (expanded || []).length; index += 1) {
    const candidate = expanded[index];
    if (!candidate) continue;
    if (!merged[index]) {
      if (merged.length < 9) merged.push({ ...candidate, paragraphs: [...(candidate.paragraphs || [])], bullets: [...(candidate.bullets || [])] });
      continue;
    }

    const target = merged[index];
    for (const paragraph of candidate.paragraphs || []) mergeParagraphText(target, paragraph);

    const paragraphSet = new Set(target.paragraphs.map(normalizeForDedupe));
    const seenBullets = new Set(target.bullets.map(normalizeForDedupe));
    for (const bullet of candidate.bullets || []) {
      const text = String(bullet || '').trim();
      const normalized = normalizeForDedupe(text);
      if (!text || !normalized || paragraphSet.has(normalized) || seenBullets.has(normalized) || target.bullets.length >= 8) continue;
      target.bullets.push(text);
      seenBullets.add(normalized);
    }
  }

  return merged;
}

export const __ollamaDepthTest = {
  paragraphChars,
  promoteUsefulBulletsToParagraphs,
  mergeExpandedSections
};

function assertQaLanguage(schema, data) {
  const issues = koreanLanguageIssues(schema, data);
  if (!issues.length) return;
  const error = new Error(`Korean-first language policy failed after final QA composition: ${issues.join(' | ')}`);
  error.code = 'KOREAN_LANGUAGE_POLICY';
  throw error;
}

export async function structuredResponse(args) {
  if (isDraftSchema(args.schema)) {
    const result = await baseStructuredResponse({
      ...args,
      schema: draftHandoffSchema(args.schema),
      instructions: `${args.instructions}\n\n${HUMAN_EDITORIAL_RULES}\n\nDraft handoff policy: This is the evidence-grounded working draft, not the final published article. Build a complete 5-9 section structure and aim for about ${DRAFT_HANDOFF_TARGET_PARAGRAPH_CHARS} Korean paragraph characters total, normally with 2-3 substantive paragraphs in important sections. Prioritize supported reasoning, decision criteria, actionable steps, limitations, and trade-offs over filler. Do not spend another generation merely padding the draft: the independent QA stage owns the final 3500+ character publication requirement. A short but structurally valid draft must still be handed to QA rather than discarded solely for length.`
    });
    const chars = paragraphChars(result.data.sections);
    if (chars < DRAFT_HANDOFF_WARN_PARAGRAPH_CHARS) {
      console.warn(`[quality] draft handoff depth=${chars} paragraph chars is below the ${DRAFT_HANDOFF_WARN_PARAGRAPH_CHARS}-char advisory target; accepting the structurally valid draft and delegating final depth to QA (hard final minimum remains 3500).`);
    } else {
      console.log(`[quality] draft handoff depth=${chars} paragraph chars; final QA minimum remains 3500.`);
    }
    return {
      ...result,
      data: { ...result.data, slug: '' }
    };
  }

  if (isQaSchema(args.schema)) {
    const primary = await baseStructuredResponse({
      ...args,
      schema: qaNoLegacyDepthSchema(args.schema),
      maxOutputTokens: Math.max(Number(args.maxOutputTokens) || 0, 4000),
      instructions: `${args.instructions}\n\n${HUMAN_EDITORIAL_RULES}\n\nFinal edit requirement: actively rewrite any sentence that reads like generic AI copy, repeated boilerplate, a translated product description, or an SEO template. Remove repeated paragraphs and artificial character-count notes. Make headings shorter and more conversational while retaining search intent. Keep facts conservative and traceable to supplied evidence.\n\nThe JSON schema calls the final article sections field 'sections' for this QA pass. Treat it exactly as the final revisedSections. Aim for at least ${QA_PRIMARY_TARGET_PARAGRAPH_CHARS} Korean paragraph characters across those sections, but never pad with repetition or unsupported claims.`
    });

    const { sections, ...rest } = primary.data;
    let data = { ...rest, revisedSections: promoteUsefulBulletsToParagraphs(sections) };
    let chars = paragraphChars(data.revisedSections);
    console.log(`[quality] final QA composed depth=${chars} paragraph chars after folding substantive list content into section prose where appropriate.`);

    if (chars < QA_MIN_PARAGRAPH_CHARS) {
      console.warn(`[quality] final QA depth=${chars} is below ${QA_MIN_PARAGRAPH_CHARS}; requesting one complete section expansion instead of legacy append-only repair.`);
      const expansion = await baseStructuredResponse({
        ...args,
        schema: sectionsOnlySchema(args.schema),
        maxOutputTokens: Math.max(Number(args.maxOutputTokens) || 0, 4200),
        timeoutMs: Math.min(Number(args.timeoutMs) || QA_EXPANSION_TIMEOUT_MS, QA_EXPANSION_TIMEOUT_MS),
        instructions: `${HUMAN_EDITORIAL_RULES}\n\nYou are completing the final reader-facing Korean article after fact checking. Return only a complete replacement 'sections' array matching the schema. Use only the supplied original QA input and the current fact-checked result. Preserve supported conclusions, but deepen practical explanations, trade-offs, decision criteria, setup steps, caveats, and failure modes. Do not invent any fact, price, date, benchmark, URL, personal experience, or example not supported by the input. Write enough substantive prose for at least ${QA_PRIMARY_TARGET_PARAGRAPH_CHARS} Korean paragraph characters.`,
        input: `ORIGINAL QA INPUT:\n${args.input}\n\nCURRENT FACT-CHECKED QA RESULT:\n${JSON.stringify(data)}\n\nExpand the article sections once. Do not return summaries or commentary outside JSON.`
      });
      const beforeMerge = chars;
      const merged = mergeExpandedSections(data.revisedSections, expansion.data.sections);
      data = { ...data, revisedSections: promoteUsefulBulletsToParagraphs(merged) };
      chars = paragraphChars(data.revisedSections);
      console.log(`[quality] final QA depth after one complete section expansion=${chars} paragraph chars (${Math.max(0, chars - beforeMerge)} chars preserved from expansion).`);
    }

    if (chars < QA_MIN_PARAGRAPH_CHARS) {
      const error = new Error(`Final QA article remained too thin after one complete section expansion (${chars} < ${QA_MIN_PARAGRAPH_CHARS} paragraph chars).`);
      error.code = 'ARTICLE_DEPTH_SHORT';
      throw error;
    }

    assertQaLanguage(args.schema, data);
    return { ...primary, data };
  }

  return baseStructuredResponse(args);
}
