import { readFile } from 'node:fs/promises';
import {
  assessQaDepth,
  QA_PREFERRED_PARAGRAPH_CHARS,
  QA_PUBLISH_FLOOR_PARAGRAPH_CHARS,
  QA_REVIEW_MAX_OUTPUT_TOKENS,
  QA_REVIEW_TIMEOUT_MS,
  QA_MAX_SECTION_REVISIONS,
  __ollamaDepthTest
} from '../src/ollama.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(QA_PREFERRED_PARAGRAPH_CHARS === 3500, 'Preferred QA depth should remain 3500 paragraph chars.');
assert(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS === 2600, 'Substantial publish floor should be 2600 paragraph chars.');
assert(QA_REVIEW_MAX_OUTPUT_TOKENS === 2400, 'Primary QA review should be capped at 2400 output tokens on the CPU runner.');
assert(QA_REVIEW_TIMEOUT_MS === 900000, 'Primary QA review should have a bounded 15-minute timeout.');
assert(QA_MAX_SECTION_REVISIONS === 4, 'Delta QA should never attempt more than four replacement sections in one pass.');

const tooThin = assessQaDepth(1907);
assert(!tooThin.publishable && tooThin.needsExpansion, '1907-char QA output must request targeted expansion.');

const justBelowFloor = assessQaDepth(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS - 1);
assert(!justBelowFloor.publishable && justBelowFloor.needsExpansion, 'Output below the shared floor must remain blocked.');

const atFloor = assessQaDepth(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS);
assert(atFloor.publishable && !atFloor.needsExpansion, 'Output at the shared floor must publish without another model pass.');

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
  ollamaSource.includes('assessQaDepth(chars).needsExpansion'),
  'QA expansion loop must stop once the shared substantial floor is reached.'
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

console.log(`Adaptive QA policy OK: preferred=${QA_PREFERRED_PARAGRAPH_CHARS}, publishFloor=${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}; run #16 stops after 2723 chars and run #17 uses <=${QA_REVIEW_MAX_OUTPUT_TOKENS} tokens with delta section review.`);
