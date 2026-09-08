import { readFile } from 'node:fs/promises';
import {
  assessQaDepth,
  repairedQaFloor,
  QA_PREFERRED_PARAGRAPH_CHARS,
  QA_PUBLISH_FLOOR_PARAGRAPH_CHARS,
  QA_NEAR_FLOOR_TOLERANCE_CHARS,
  QA_REPAIRED_FLOOR_MIN_PARAGRAPH_CHARS,
  QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS,
  QA_REVIEW_MAX_OUTPUT_TOKENS,
  QA_REVIEW_TIMEOUT_MS,
  QA_MAX_SECTION_REVISIONS,
  __ollamaDepthTest
} from '../src/ollama.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(QA_PREFERRED_PARAGRAPH_CHARS === 3500, 'Preferred QA depth should remain 3500 paragraph chars.');
assert(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS === 2600, 'Substantial publish floor should remain 2600 paragraph chars.');
assert(QA_NEAR_FLOOR_TOLERANCE_CHARS === 150, 'Post-repair near-floor tolerance should remain tightly bounded at 150 chars.');
assert(QA_REPAIRED_FLOOR_MIN_PARAGRAPH_CHARS === 1200, 'Adaptive repaired floor must never fall below 1200 paragraph chars.');
assert(QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS === 1800, 'Adaptive repaired floor must never exceed 1800 paragraph chars.');
assert(repairedQaFloor(900) === 1200, 'Very short drafts must still require the 1200-char structural safety floor after repair.');
assert(repairedQaFloor(1313) === 1313, 'Run #20 draft depth should become its own adaptive repaired floor.');
assert(repairedQaFloor(2100) === 1800, 'Longer drafts should cap the fallback floor at 1800 chars.');
assert(QA_REVIEW_MAX_OUTPUT_TOKENS === 1600, 'Primary QA review should be capped at 1600 output tokens on the CPU runner.');
assert(QA_REVIEW_TIMEOUT_MS === 480000, 'Primary QA review should have a bounded 8-minute timeout.');
assert(QA_MAX_SECTION_REVISIONS === 2, 'Delta QA should never attempt more than two replacement sections in one pass.');

const tooThin = assessQaDepth(1907);
assert(!tooThin.publishable && tooThin.needsExpansion, '1907-char QA output must still request targeted expansion before repaired-floor acceptance is enabled.');

const belowTolerance = assessQaDepth(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS - QA_NEAR_FLOOR_TOLERANCE_CHARS - 1);
assert(!belowTolerance.publishable && belowTolerance.needsExpansion, 'Output below the bounded near-floor minimum must remain blocked before targeted repair.');

const atToleranceBoundary = assessQaDepth(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS - QA_NEAR_FLOOR_TOLERANCE_CHARS);
assert(atToleranceBoundary.publishable && atToleranceBoundary.acceptedNearFloor, 'Exact near-floor boundary should be accepted only as a bounded post-repair result.');

const strictNearFloor = assessQaDepth(2476, { allowNearFloor: false });
assert(!strictNearFloor.publishable && strictNearFloor.needsExpansion, '2476 chars must still request the first targeted repair when near-floor acceptance is disabled.');

// Regression from Automated Blog Publisher run #19: the first targeted expansion
// reached 2476 chars, only 124 below the 2600 strict floor. The old policy spent
// another 584 seconds on a second expansion that preserved 0 new chars and then
// discarded the entire run. After one repair, 2476 must be accepted inside the
// tightly bounded near-floor tolerance instead of triggering another slow call.
const run19AfterFirstExpansion = assessQaDepth(2476);
assert(run19AfterFirstExpansion.publishable, '2476-char run #19 regression output should be publishable after targeted repair.');
assert(run19AfterFirstExpansion.acceptedNearFloor, '2476-char run #19 regression must be identified as bounded near-floor acceptance.');
assert(run19AfterFirstExpansion.shortfallToFloor === 124, 'Run #19 shortfall should remain visible in diagnostics.');
assert(!run19AfterFirstExpansion.meetsPreferred, '2476 chars should remain below the preferred target, not be mislabeled as ideal depth.');

// Regression from the 2026-09-07 failure after run #19: delta QA reduced a
// 1313-char draft to 889 chars. The first targeted expansion recovered it to
// 1515 chars, but the old fixed floor forced a second 473-second model call and
// still failed at 2103. Once one bounded repair has made the QA-approved article
// at least as deep as the original draft (subject to the 1200-1800 safety band),
// length alone must not discard the publication.
const run20RepairedFloor = repairedQaFloor(1313);
const run20BeforeRepair = assessQaDepth(889, {
  allowNearFloor: false,
  allowRepairedFloor: false,
  repairedFloor: run20RepairedFloor
});
assert(!run20BeforeRepair.publishable, 'Run #20 must still perform at least one targeted repair from the 889-char QA composition.');

const run20WithoutRepairPermission = assessQaDepth(1515, { repairedFloor: run20RepairedFloor });
assert(!run20WithoutRepairPermission.publishable, 'Adaptive repaired-floor acceptance must never activate before a repair has actually run.');

const run20AfterFirstRepair = assessQaDepth(1515, {
  allowRepairedFloor: true,
  repairedFloor: run20RepairedFloor
});
assert(run20AfterFirstRepair.publishable, '1515-char run #20 output should publish after the first bounded repair.');
assert(run20AfterFirstRepair.acceptedRepairedFloor, 'Run #20 first repair must be identified as adaptive repaired-floor acceptance.');
assert(run20AfterFirstRepair.repairedFloor === 1313, 'Run #20 adaptive repaired floor should be tied to its 1313-char draft.');

const run20FormerFailure = assessQaDepth(2103, {
  allowRepairedFloor: true,
  repairedFloor: run20RepairedFloor
});
assert(run20FormerFailure.publishable && run20FormerFailure.acceptedRepairedFloor, 'The former 2103-char terminal failure must be publishable after bounded repair.');

const belowRun20AdaptiveFloor = assessQaDepth(1312, {
  allowRepairedFloor: true,
  repairedFloor: run20RepairedFloor
});
assert(!belowRun20AdaptiveFloor.publishable, 'Adaptive recovery must still block output that is thinner than the source draft floor.');

const atFloor = assessQaDepth(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS);
assert(atFloor.publishable && atFloor.meetsStrictFloor && !atFloor.acceptedNearFloor && !atFloor.acceptedRepairedFloor && !atFloor.needsExpansion, 'Output at the strict shared floor must publish without tolerance.');

// Regression from Automated Blog Publisher run #16: after the first targeted
// expansion the article reached 2723 paragraph chars. The old policy spent
// another 583 seconds generating and still failed at 3205 chars.
const afterFirstExpansion = assessQaDepth(2723);
assert(afterFirstExpansion.publishable, '2723-char run #16 regression output should be publishable.');
assert(!afterFirstExpansion.needsExpansion, '2723-char run #16 regression output must not trigger a second slow expansion.');
assert(!afterFirstExpansion.meetsPreferred, '2723 chars should remain below the preferred target, not be mislabeled as ideal depth.');

const oldFailure = assessQaDepth(3205);
assert(oldFailure.publishable && !oldFailure.needsExpansion, '3205-char former failure must now pass the shared depth gate.');

const preferred = assessQaDepth(QA_PREFERRED_PARAGRAPH_CHARS);
assert(preferred.publishable && preferred.meetsPreferred && !preferred.needsExpansion, 'Preferred-depth output should pass cleanly.');

// Regression from Automated Blog Publisher run #17: QA was regenerating all 5-9
// sections and hit the 1500-second request timeout. Delta QA must preserve safe
// draft sections and replace only explicitly returned section indexes.
const seedSections = [
  { heading: '첫 섹션', paragraphs: ['첫 섹션 원문'], bullets: ['첫 불릿'] },
  { heading: '둘째 섹션', paragraphs: ['둘째 섹션 원문'], bullets: [] },
  { heading: '셋째 섹션', paragraphs: ['셋째 섹션 원문'], bullets: [] }
];
const revised = __ollamaDepthTest.applyQaSectionRevisions(seedSections, [
  { sectionIndex: 1, heading: '둘째 섹션 수정', paragraphs: ['검증 후 교체한 둘째 섹션'], bullets: ['수정 불릿'] }
]);
assert(revised.length === seedSections.length, 'Delta QA must preserve the original section count.');
assert(revised[0].paragraphs[0] === '첫 섹션 원문', 'Unchanged draft sections must be preserved byte-for-byte at the content level.');
assert(revised[1].heading === '둘째 섹션 수정', 'Requested section replacement was not applied.');
assert(revised[2].paragraphs[0] === '셋째 섹션 원문', 'Later unchanged draft sections must remain intact.');

// Regression from the 2026-09-08 run: primary QA exceeded 900 seconds before
// producing any structured result. A timeout must degrade to the already
// evidence-grounded draft when that draft independently clears structural,
// source-count, Korean-language, and adaptive-depth safety checks.
const timeoutParagraph = '공개 근거와 연구 브리프에서 확인된 내용만 바탕으로 실제 업무에서 판단할 기준과 적용 순서를 설명합니다. 지원되지 않은 수치나 경험은 덧붙이지 않고, 사용자가 확인해야 할 조건과 제한 사항을 함께 정리합니다. ';
const timeoutSeedDraft = {
  title: '셀프 호스팅 AI 도구를 고를 때 확인할 기준',
  description: '직장인이 셀프 호스팅 AI를 검토할 때 먼저 확인할 조건을 정리합니다. 공개 근거를 바탕으로 도입 판단과 운영상의 제한을 설명합니다.',
  sections: Array.from({ length: 5 }, (_, index) => ({
    heading: `확인 기준 ${index + 1}`,
    paragraphs: [timeoutParagraph.repeat(5)],
    bullets: []
  })),
  faq: [
    { question: '먼저 무엇을 확인해야 하나요?', answer: '현재 업무와 데이터 조건을 먼저 확인해야 합니다.' },
    { question: '바로 전환해도 되나요?', answer: '작은 범위에서 검증한 뒤 확대하는 편이 안전합니다.' }
  ],
  sources: [
    { title: '공식 문서 1', url: 'https://example.com/source-1' },
    { title: '공식 문서 2', url: 'https://example.com/source-2' },
    { title: '공식 문서 3', url: 'https://example.com/source-3' }
  ]
};
const timeoutChars = __ollamaDepthTest.paragraphChars(timeoutSeedDraft.sections);
assert(timeoutChars >= 1800, `Timeout fallback fixture must clear the 1800-char safety floor, got ${timeoutChars}.`);
const timeoutFallback = __ollamaDepthTest.buildQaTimeoutFallback({
  seedDraft: timeoutSeedDraft,
  minimumQaScore: 85,
  adaptiveRepairedFloor: repairedQaFloor(timeoutChars)
});
assert(timeoutFallback.approved, 'Evidence-grounded timeout fallback should remain publishable instead of crashing the workflow.');
assert(timeoutFallback.score === 85, 'Timeout fallback should use the configured minimum QA score, not fabricate a higher score.');
assert(timeoutFallback.revisedSections.length === 5, 'Timeout fallback must preserve the complete draft structure.');
assert(timeoutFallback.verifiedSources.length === 3, 'Timeout fallback must preserve three distinct valid draft sources for downstream whitelisting.');
assert(timeoutFallback.visualPlan.photoNeeded === false, 'Timeout fallback must not invent an external photo request.');

const unsafeTimeoutFallback = __ollamaDepthTest.buildQaTimeoutFallback({
  seedDraft: { ...timeoutSeedDraft, sources: timeoutSeedDraft.sources.slice(0, 2) },
  minimumQaScore: 85,
  adaptiveRepairedFloor: repairedQaFloor(timeoutChars)
});
assert(!unsafeTimeoutFallback.approved, 'Timeout fallback must remain blocked when fewer than three source candidates survive basic validation.');

const ollamaSource = await readFile(new URL('../src/ollama.mjs', import.meta.url), 'utf8');
const ollamaBaseSource = await readFile(new URL('../src/ollama-base.mjs', import.meta.url), 'utf8');
const pipelineSource = await readFile(new URL('../src/pipeline.mjs', import.meta.url), 'utf8');

assert(
  ollamaSource.includes('allowRepairedFloor: useDeltaReview && round > 1'),
  'QA expansion loop must enable the adaptive repaired floor only after one real targeted repair.'
);
assert(
  ollamaSource.includes('derived from the ${seedDraftChars}-char draft'),
  'Run #20 recovery diagnostics must explain the adaptive floor source.'
);
assert(
  ollamaSource.includes('const QA_EXPANSION_MAX_ROUNDS = 2;'),
  'Emergency repair budget should remain capped at two rounds for genuinely thin output.'
);
assert(
  ollamaSource.includes('properties.sectionRevisions = {'),
  'Publication QA must use a bounded delta section-revision schema.'
);
assert(
  ollamaSource.includes('Do NOT regenerate the complete article'),
  'Delta QA prompt must explicitly forbid whole-article regeneration.'
);
assert(
  ollamaSource.includes('do not compress a section merely to be concise'),
  'Delta QA replacements must be told not to destroy useful supported depth just for concision.'
);
assert(
  ollamaSource.includes("error?.code === 'OLLAMA_REQUEST_TIMEOUT'"),
  'Publication QA must catch a bounded local Ollama timeout instead of terminating the complete publish workflow.'
);
assert(
  ollamaSource.includes('using deterministic QA timeout fallback'),
  'QA timeout handling must clearly enter the deterministic evidence-grounded fallback path.'
);
assert(
  ollamaSource.includes('Math.min(Math.max(1, Number(args.maxOutputTokens) || QA_REVIEW_MAX_OUTPUT_TOKENS), QA_REVIEW_MAX_OUTPUT_TOKENS)'),
  'Primary QA output must be capped independently of the legacy 5600-token stage budget.'
);
assert(
  ollamaSource.includes('skipping depth expansion because additional prose cannot rescue a rejected review'),
  'Rejected QA reviews must not spend another model pass on depth expansion.'
);
assert(
  ollamaBaseSource.includes('think: false'),
  'Qwen3 thinking must remain disabled for structured CPU-runner calls.'
);
assert(
  pipelineSource.includes('repairedQaFloor(articleDraftChars)'),
  'Publisher must recompute the same adaptive repaired floor from the original draft.'
);
assert(
  pipelineSource.includes('allowRepairedFloor: true'),
  'Publisher must honor the repaired depth policy already enforced by the QA wrapper.'
);
assert(
  !pipelineSource.includes('articleChars < 3500'),
  'Publisher must not reintroduce a separate hardcoded 3500-character gate.'
);
assert(
  pipelineSource.includes('QA_PUBLISH_FLOOR_PARAGRAPH_CHARS'),
  'Publisher diagnostics must continue to reference the strict publish target.'
);

console.log(`Adaptive QA policy OK: preferred=${QA_PREFERRED_PARAGRAPH_CHARS}, strictFloor=${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}, nearFloorTolerance=${QA_NEAR_FLOOR_TOLERANCE_CHARS}, repairedFloor=${QA_REPAIRED_FLOOR_MIN_PARAGRAPH_CHARS}-${QA_REPAIRED_FLOOR_MAX_PARAGRAPH_CHARS}; primary QA is capped at ${QA_REVIEW_MAX_OUTPUT_TOKENS} tokens/${QA_REVIEW_TIMEOUT_MS / 60000}m with deterministic timeout fallback, run #20 accepts 1515 after one repair, and run #19 accepts 2476.`);
