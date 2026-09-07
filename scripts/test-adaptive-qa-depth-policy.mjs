import { readFile } from 'node:fs/promises';
import {
  assessQaDepth,
  QA_PREFERRED_PARAGRAPH_CHARS,
  QA_PUBLISH_FLOOR_PARAGRAPH_CHARS
} from '../src/ollama.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(QA_PREFERRED_PARAGRAPH_CHARS === 3500, 'Preferred QA depth should remain 3500 paragraph chars.');
assert(QA_PUBLISH_FLOOR_PARAGRAPH_CHARS === 2600, 'Substantial publish floor should be 2600 paragraph chars.');

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

const ollamaSource = await readFile(new URL('../src/ollama.mjs', import.meta.url), 'utf8');
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

console.log(`Adaptive QA depth policy OK: preferred=${QA_PREFERRED_PARAGRAPH_CHARS}, publishFloor=${QA_PUBLISH_FLOOR_PARAGRAPH_CHARS}; run #16 stops after 2723 chars instead of spending a second 583s repair.`);
