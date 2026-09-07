import {
  ensureModel,
  removeModel,
  structuredResponse as baseStructuredResponse
} from './ollama-base.mjs';
import { koreanLanguageIssues } from './language.mjs';
import { READER_FRIENDLY_EDITORIAL_RULES, rebalanceSectionsForReadability } from './editorial-style.mjs';

export { ensureModel, removeModel };

const DRAFT_HANDOFF_WARN_PARAGRAPH_CHARS = 1000;
const DRAFT_HANDOFF_TARGET_PARAGRAPH_CHARS = 2200;
export const QA_PREFERRED_PARAGRAPH_CHARS = 3500;
export const QA_PUBLISH_FLOOR_PARAGRAPH_CHARS = 2600;
export const QA_NEAR_FLOOR_TOLERANCE_CHARS = 150;
export const QA_REPAIRED_FLOOR_MIN_PARAGRAPH_CHARS = 1200;
export const QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS = 1800;
const QA_PRIMARY_TARGET_PARAGRAPH_CHARS = 3800;
export const QA_REVIEW_MAX_OUTPUT_TOKENS = 2400;
export const QA_REVIEW_TIMEOUT_MS = 900000;
export const QA_MAX_SECTION_REVISIONS = 4;
const QA_EXPANSION_TIMEOUT_MS = 900000;
const QA_EXPANSION_MAX_OUTPUT_TOKENS = 2200;
const QA_EXPANSION_MAX_ROUNDS = 2;

const HUMAN_EDITORIAL_RULES = READER_FRIENDLY_EDITORIAL_RULES;

export function repairedQaFloor(draftChars) {
  const chars = Math.max(0, Number(draftChars) || 0);
  return Math.max(
    QA_REPAIRED_FLOOR_MIN_PARAGRAPH_CHARS,
    Math.min(QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS, chars)
  );
}

export function assessQaDepth(value, {
  allowNearFloor = true,
  allowRepairedFloor = false,
  repairedFloor = QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS
} = {}) {
  const chars = Math.max(0, Number(value) || 0);
  const acceptedFloor = Math.max(0, QA_PUBLISH_FLOOR_PARAGRAPH_CHARS - QA_NEAR_FLOOR_TOLERANCE_CHARS);
  const boundedRepairedFloor = Math.max(
    QA_REPAIRED_FLOOR_MIN_PARAGRAPH_CHARS,
    Math.min(QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS, Number(repairedFloor) || QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS)
  );
  const meetsStrictFloor = chars >= QA_PUBLISH_FLOOR_PARAGRAPH_CHARS;
  const acceptedNearFloor = Boolean(allowNearFloor) && !meetsStrictFloor && chars >= acceptedFloor;
  const acceptedRepairedFloor = Boolean(allowRepairedFloor) && !meetsStrictFloor && !acceptedNearFloor && chars >= boundedRepairedFloor;
  const publishable = meetsStrictFloor || acceptedNearFloor || acceptedRepairedFloor;
  return {
    chars,
    meetsPreferred: chars >= QA_PREFERRED_PARAGRAPH_CHARS,
    meetsStrictFloor,
    acceptedNearFloor,
    acceptedRepairedFloor,
    acceptedFloor,
    repairedFloor: boundedRepairedFloor,
    publishable,
    needsExpansion: !publishable,
    shortfallToPreferred: Math.max(0, QA_PREFERRED_PARAGRAPH_CHARS - chars),
    shortfallToFloor: Math.max(0, QA_PUBLISH_FLOOR_PARAGRAPH_CHARS - chars),
    shortfallToAcceptedFloor: Math.max(0, acceptedFloor - chars),
    shortfallToRepairedFloor: Math.max(0, boundedRepairedFloor - chars)
  };
}

const qaExpansionSchema = {
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
          paragraphs: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string' } }
        },
        required: ['sectionIndex', 'paragraphs']
      }
    }
  },
  required: ['additions']
};

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

function isPublicationQaSchema(schema) {
  const properties = schema?.properties || {};
  return isQaSchema(schema) && Boolean(
    properties.score && properties.approved && properties.verifiedSources && properties.warnings
  );
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

function qaDeltaReviewSchema(schema) {
  const properties = { ...(schema?.properties || {}) };
  const sectionSchema = properties.revisedSections?.items;
  if (!sectionSchema) throw new Error('QA schema is missing revisedSections item shape.');
  delete properties.revisedSections;
  properties.sectionRevisions = {
    type: 'array',
    maxItems: QA_MAX_SECTION_REVISIONS,
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sectionIndex: { type: 'integer' },
        ...(sectionSchema.properties || {})
      },
      required: ['sectionIndex', ...(sectionSchema.required || [])]
    }
  };
  return {
    ...schema,
    properties,
    required: [
      ...(schema?.required || []).filter((field) => field !== 'revisedSections'),
      'sectionRevisions'
    ]
  };
}

function extractQaDraft(input) {
  const text = String(input || '');
  const draftMarker = '\nDraft: ';
  const evidenceMarker = '\n\nPUBLIC EVIDENCE:';
  const start = text.indexOf(draftMarker);
  if (start < 0) throw new Error('QA input is missing the Draft payload required for delta review.');
  const jsonStart = start + draftMarker.length;
  const end = text.indexOf(evidenceMarker, jsonStart);
  if (end < 0) throw new Error('QA input is missing the PUBLIC EVIDENCE delimiter after Draft.');
  let draft;
  try {
    draft = JSON.parse(text.slice(jsonStart, end));
  } catch (error) {
    throw new Error(`QA Draft payload could not be parsed for delta review: ${error.message}`);
  }
  if (!Array.isArray(draft?.sections) || draft.sections.length < 1) {
    throw new Error('QA Draft payload contains no sections for delta review.');
  }
  return draft;
}

function applyQaSectionRevisions(seedSections, revisions) {
  const next = (seedSections || []).map((section) => ({
    ...section,
    paragraphs: [...(section.paragraphs || [])],
    bullets: [...(section.bullets || [])]
  }));
  if (!next.length) throw new Error('Delta QA requires at least one seed section.');
  if ((revisions || []).length > QA_MAX_SECTION_REVISIONS) {
    throw new Error(`Delta QA returned too many section revisions (${revisions.length} > ${QA_MAX_SECTION_REVISIONS}).`);
  }
  const seen = new Set();
  for (const revision of revisions || []) {
    const index = Number(revision?.sectionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= next.length) {
      const error = new Error(`Delta QA returned invalid sectionIndex: ${revision?.sectionIndex}.`);
      error.code = 'QA_SECTION_REVISION_INVALID';
      throw error;
    }
    if (seen.has(index)) {
      const error = new Error(`Delta QA returned duplicate sectionIndex: ${index}.`);
      error.code = 'QA_SECTION_REVISION_INVALID';
      throw error;
    }
    seen.add(index);
    next[index] = {
      heading: String(revision.heading || '').trim(),
      paragraphs: [...(revision.paragraphs || [])],
      bullets: [...(revision.bullets || [])]
    };
  }
  return next;
}

function minimumQaScoreFromInput(input) {
  const match = String(input || '').match(/Minimum passing score:\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
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

  // The schema caps each section at five paragraphs. If a useful repair arrives after
  // the section is full, preserve it by folding it into the shortest paragraph.
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

function promoteUsefulBulletsToParagraphs(sections, minimum = QA_PREFERRED_PARAGRAPH_CHARS) {
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

function mergeQaAdditions(current, additions) {
  const merged = (current || []).map((section) => ({
    ...section,
    paragraphs: [...(section.paragraphs || [])],
    bullets: [...(section.bullets || [])]
  }));
  for (const addition of additions || []) {
    const index = Number(addition?.sectionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= merged.length) continue;
    for (const paragraph of addition.paragraphs || []) mergeParagraphText(merged[index], paragraph);
  }
  return merged;
}

export const __ollamaDepthTest = {
  paragraphChars,
  promoteUsefulBulletsToParagraphs,
  mergeExpandedSections,
  mergeQaAdditions,
  assessQaDepth,
  repairedQaFloor,
  applyQaSectionRevisions
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
      instructions: `${args.instructions}\n\n${HUMAN_EDITORIAL_RULES}\n\nDraft handoff policy: This is the evidence-grounded working draft, not the final published article. Build a complete 5-9 section structure and aim for about ${DRAFT_HANDOFF_TARGET_PARAGRAPH_CHARS} Korean paragraph characters total, normally with 2-3 substantive paragraphs in important sections. Prioritize supported reasoning, decision criteria, actionable steps, limitations, and trade-offs over filler. Do not spend another generation merely padding the draft: the independent QA stage owns the preferred ${QA_PREFERRED_PARAGRAPH_CHARS}+ character depth target, while a fact-checked article may publish above the substantial ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}-character floor. A short but structurally valid draft must still be handed to QA rather than discarded solely for length.`
    });
    const balancedSections = rebalanceSectionsForReadability(result.data.sections);
    const chars = paragraphChars(balancedSections);
    if (chars < DRAFT_HANDOFF_WARN_PARAGRAPH_CHARS) {
      console.warn(`[quality] draft handoff depth=${chars} paragraph chars is below the ${DRAFT_HANDOFF_WARN_PARAGRAPH_CHARS}-char advisory target; accepting the structurally valid draft and delegating final depth to QA (preferred ${QA_PREFERRED_PARAGRAPH_CHARS}, publish floor ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}).`);
    } else {
      console.log(`[quality] draft handoff depth=${chars} paragraph chars; final QA preferred target=${QA_PREFERRED_PARAGRAPH_CHARS}, publish floor=${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}.`);
    }
    return {
      ...result,
      data: { ...result.data, sections: balancedSections, slug: '' }
    };
  }

  if (isQaSchema(args.schema)) {
    const useDeltaReview = isPublicationQaSchema(args.schema);
    const seedDraft = useDeltaReview ? extractQaDraft(args.input) : null;
    const seedDraftChars = useDeltaReview ? paragraphChars(seedDraft.sections) : 0;
    const adaptiveRepairedFloor = useDeltaReview
      ? repairedQaFloor(seedDraftChars)
      : QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS;
    const primarySchema = useDeltaReview ? qaDeltaReviewSchema(args.schema) : qaNoLegacyDepthSchema(args.schema);
    const primaryMaxOutputTokens = useDeltaReview
      ? Math.min(Math.max(1, Number(args.maxOutputTokens) || QA_REVIEW_MAX_OUTPUT_TOKENS), QA_REVIEW_MAX_OUTPUT_TOKENS)
      : Math.max(Number(args.maxOutputTokens) || 0, 4000);
    const primaryTimeoutMs = useDeltaReview
      ? Math.min(Math.max(1, Number(args.timeoutMs) || QA_REVIEW_TIMEOUT_MS), QA_REVIEW_TIMEOUT_MS)
      : args.timeoutMs;
    const reviewInstruction = useDeltaReview
      ? `\n\nSlow-runner delta review requirement: Do NOT regenerate the complete article. The field 'sectionRevisions' is a patch list, not the final sections array. Preserve every supplied Draft section that is already factually defensible, useful, and well written. Return a replacement only for a section that has a consequential factual, clarity, structure, or reader-value problem. Each replacement must include the original zero-based sectionIndex plus the complete replacement heading, paragraphs, and bullets for that one section. Preserve every supported useful point from the original section; do not compress a section merely to be concise. Unless unsupported or repetitive material must be removed, keep the replacement roughly comparable in useful depth to the section it replaces. Return an empty sectionRevisions array when no body section needs replacement. You may replace at most ${QA_MAX_SECTION_REVISIONS} sections. If more than ${QA_MAX_SECTION_REVISIONS} body sections require substantial correction, set approved=false and explain why in warnings instead of attempting a whole-article rewrite. approved=true is allowed only when every omitted Draft section is safe to preserve unchanged and the returned replacements resolve all consequential issues. Keep revisedTitle, revisedDescription, revisedFaq, verifiedSources, warnings, verificationSummary, and visualPlan concise and complete.`
      : `\n\nThe JSON schema calls the final article sections field 'sections' for this QA pass. Treat it exactly as the final revisedSections. Aim for at least ${QA_PRIMARY_TARGET_PARAGRAPH_CHARS} Korean paragraph characters across those sections, but never pad with repetition or unsupported claims. The preferred publication depth is ${QA_PREFERRED_PARAGRAPH_CHARS}; depth alone must not override factual quality or reader usefulness.`;

    const primary = await baseStructuredResponse({
      ...args,
      schema: primarySchema,
      maxOutputTokens: primaryMaxOutputTokens,
      timeoutMs: primaryTimeoutMs,
      instructions: `${args.instructions}\n\n${HUMAN_EDITORIAL_RULES}\n\nFinal edit requirement: actively rewrite any sentence that reads like generic AI copy, repeated boilerplate, a translated product description, or an SEO template. Remove repeated paragraphs and artificial character-count notes. Make headings shorter and more conversational while retaining search intent. Keep facts conservative and traceable to supplied evidence. Make revisedDescription work as a human lede as well as metadata: normally two compact Korean sentences, first naming the reader situation or decision and second stating the useful outcome.${reviewInstruction}`
    });

    let data;
    if (useDeltaReview) {
      const { sectionRevisions, ...rest } = primary.data;
      data = {
        ...rest,
        revisedSections: rebalanceSectionsForReadability(
          promoteUsefulBulletsToParagraphs(
            applyQaSectionRevisions(seedDraft.sections, sectionRevisions),
            QA_PUBLISH_FLOOR_PARAGRAPH_CHARS
          )
        )
      };
      console.log(`[quality] delta QA preserved ${seedDraft.sections.length - sectionRevisions.length}/${seedDraft.sections.length} draft sections and replaced ${sectionRevisions.length}.`);
    } else {
      const { sections, ...rest } = primary.data;
      data = {
        ...rest,
        revisedSections: rebalanceSectionsForReadability(promoteUsefulBulletsToParagraphs(sections))
      };
    }

    let chars = paragraphChars(data.revisedSections);
    console.log(`[quality] final QA composed depth=${chars} paragraph chars after folding substantive list content into section prose where appropriate.`);

    const minimumQaScore = minimumQaScoreFromInput(args.input);
    const qaVerdictPasses = data.approved !== false && (
      minimumQaScore == null || !Number.isFinite(Number(data.score)) || Number(data.score) >= minimumQaScore
    );
    if (!qaVerdictPasses) {
      console.warn(`[quality] QA verdict is below the publication gate; skipping depth expansion because additional prose cannot rescue a rejected review.`);
      return { ...primary, data };
    }

    let depthRepairRounds = 0;
    for (let round = 1; round <= QA_EXPANSION_MAX_ROUNDS; round += 1) {
      const expansionDepth = assessQaDepth(chars, {
        allowNearFloor: round > 1,
        allowRepairedFloor: useDeltaReview && round > 1,
        repairedFloor: adaptiveRepairedFloor
      });
      if (!expansionDepth.needsExpansion) {
        if (expansionDepth.acceptedNearFloor) {
          console.warn(`[quality] final QA depth=${chars} is within the bounded ${QA_NEAR_FLOOR_TOLERANCE_CHARS}-char tolerance below the ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}-char floor after a prior targeted repair; skipping another slow expansion.`);
        } else if (expansionDepth.acceptedRepairedFloor) {
          console.warn(`[quality] final QA depth=${chars} remains below the strict ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}-char target but exceeds the adaptive repaired floor ${expansionDepth.repairedFloor} derived from the ${seedDraftChars}-char draft. The QA verdict passed and one targeted repair already improved the article, so publication will continue instead of spending another slow model call solely on length.`);
        }
        break;
      }
      const missing = QA_PUBLISH_FLOOR_PARAGRAPH_CHARS - chars;
      const requested = Math.max(500, missing + 250);
      console.warn(`[quality] final QA depth=${chars} is below the substantial publish floor ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}; requesting targeted expansion ${round}/${QA_EXPANSION_MAX_ROUNDS} for about ${requested} additional paragraph chars.`);
      depthRepairRounds = round;
      const expansion = await baseStructuredResponse({
        ...args,
        schema: qaExpansionSchema,
        maxOutputTokens: QA_EXPANSION_MAX_OUTPUT_TOKENS,
        timeoutMs: Math.min(Number(args.timeoutMs) || QA_EXPANSION_TIMEOUT_MS, QA_EXPANSION_TIMEOUT_MS),
        instructions: `${HUMAN_EDITORIAL_RULES}\n\nYou are doing a targeted depth repair of an already fact-checked Korean article. Return only an 'additions' array. Each addition must reference an existing zero-based sectionIndex and contain one or two new Korean paragraphs. Do not rewrite or repeat existing paragraphs. Each paragraph should normally be 180-320 Korean characters and must add practical explanation, decision criteria, setup detail, caveats, trade-offs, or failure modes that are directly supported by the supplied QA input. Prefer a concrete reader situation or decision example when it can be expressed without inventing facts. Do not invent facts, prices, dates, benchmarks, URLs, personal experience, or unsupported examples. Produce about ${requested} additional paragraph characters in total. When the shortfall is large, spread useful additions across multiple sections and keep adding distinct supported detail until the requested amount is approximately covered rather than returning a token one-paragraph repair.`,
        input: `ORIGINAL QA INPUT:\n${args.input}\n\nCURRENT FACT-CHECKED SECTIONS:\n${JSON.stringify(data.revisedSections)}\n\nReturn targeted additions only. Do not regenerate the complete sections array.`
      });
      const beforeMerge = chars;
      const merged = mergeQaAdditions(data.revisedSections, expansion.data.additions);
      data = {
        ...data,
        revisedSections: rebalanceSectionsForReadability(promoteUsefulBulletsToParagraphs(merged))
      };
      chars = paragraphChars(data.revisedSections);
      console.log(`[quality] final QA depth after targeted expansion ${round}=${chars} paragraph chars (${Math.max(0, chars - beforeMerge)} chars preserved from additions).`);
      if (chars <= beforeMerge) break;
    }

    const depth = assessQaDepth(chars, {
      allowRepairedFloor: useDeltaReview && depthRepairRounds > 0,
      repairedFloor: adaptiveRepairedFloor
    });
    if (depth.acceptedNearFloor) {
      console.warn(`[quality] final QA depth=${chars} is ${depth.shortfallToFloor} chars below the strict ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}-char floor but inside the bounded ${QA_NEAR_FLOOR_TOLERANCE_CHARS}-char post-repair tolerance. Publication will continue because the QA verdict passed and another slow model call would be disproportionate to this marginal shortfall.`);
    } else if (depth.acceptedRepairedFloor) {
      console.warn(`[quality] final QA depth=${chars} is below the strict ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}-char target but above the adaptive repaired floor ${depth.repairedFloor}. Publication will continue because the independent QA verdict passed, the article retains the required 5-9 section structure, and bounded depth repair has already been attempted.`);
    } else if (depth.publishable && !depth.meetsPreferred) {
      console.warn(`[quality] final QA depth=${chars} is below the preferred ${QA_PREFERRED_PARAGRAPH_CHARS}-char target but above the substantial ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}-char publish floor. Publication will continue because reader usefulness, QA approval, and evidence quality matter more than padding to a fixed count.`);
    }

    if (!depth.publishable) {
      const error = new Error(`Final QA article remained materially too thin after targeted expansion (${chars} paragraph chars; strict floor ${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}, bounded near-floor minimum ${depth.acceptedFloor}, adaptive repaired minimum ${depth.repairedFloor}, preferred target ${QA_PREFERRED_PARAGRAPH_CHARS}).`);
      error.code = 'ARTICLE_DEPTH_SHORT';
      throw error;
    }

    assertQaLanguage(args.schema, data);
    return { ...primary, data };
  }

  return baseStructuredResponse(args);
}