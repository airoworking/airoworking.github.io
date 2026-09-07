import { readFile } from 'node:fs/promises';
import {
  assessQaDepth,
  QA_PREFERRED_PARAGRAPH_CHARS,
  QA_PUBLISH_FLOOR_PARAGRAPH_CHARS,
  QA_NEAR_FLOOR_TOLERANCE_CHARS,
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
assert(QA_REVIEW_MAX_OUTPUT_TOKENS === 2400, 'Primary QA review should be capped at 2400 output tokens on the CPU runner.');
assert(QA_REVIEW_TIMEOUT_MS === 900000, 'Primary QA review should have a bounded 15-minute timeout.');
assert(QA_MAX_SECTION_REVISIONS === 4, 'Delta QA should never attempt more than four replacement sections in one pass.');

const tooThin = assessQaDepth(1907);
assert(!tooThin.publishable && tooThin.needsExpansion, '1907-char QA output must request targeted expansion.');

const belowTolerance = assessQaDepth(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS - QA_NEAR_FLOOR_TOLERANCE_CHARS - 1);
assert(!belowTolerance.publishable && belowTolerance.needsExpansion, 'Output below the bounded near-floor minimum must remain blocked.');

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

const atFloor = assessQaDepth(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS);
assert(atFloor.publishable && atFloor.meetsStrictFloor && !atFloor.acceptedNearFloor && !atFloor.needsExpansion, 'Output at the strict shared floor must publish without tolerance.');

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

const ollamaSource = await readFile(new URL('../src/ollama.mjs', import.meta.url), 'utf8');
const ollamaBaseSource = await readFile(new URL('../src/ollama-base.mjs', import.meta.url), 'utf8');
const pipelineSource = await readFile(new URL('../src/pipeline.mjs', import.meta.url), 'utf8');

assert(
  ollamaSource.includes('const expansionDepth = assessQaDepth(chars, { allowNearFloor: round > 1 });'),
  'QA expansion loop must require one strict repair before enabling bounded near-floor acceptance.'
);
assert(
  ollamaSource.includes('skipping another slow expansion'),
  'Run #19 regression must stop before a second slow expansion once the bounded post-repair band is reached.'
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
  pipelineSource.includes('const articleDepth = assessQaDepth(articleChars);'),
  'Publisher must use the same shared QA depth decision as the model wrapper.'
);
assert(
  !pipelineSource.includes('articleChars < 3500'),
  'Publisher must not reintroduce a separate hardcoded 3500-character gate.'
);
assert(
  pipelineSource.includes('QA_PUBLISH_FLOOR_PARAGRAPH_CHARS'),
  'Publisher error diagnostics must reference the shared publish floor.'
);

console.log(`Adaptive QA policy OK: preferred=${QA_PREFERRED_PARAGRAPH_CHARS}, strictFloor=${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}, nearFloorTolerance=${QA_NEAR_FLOOR_TOLERANCE_CHARS}; run #19 accepts 2476 after one repair, run #16 stops at 2723, and run #17 uses <=${QA_REVIEW_MAX_OUTPUT_TOKENS} tokens with delta section review.`);
